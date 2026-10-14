import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { recordAnswerEvent } from "../qa-events";
import { enrichAnswerIdentities } from "./identity";
import { listAnswerRecords, parseAnswerFilters } from "./query";
import { exportAnswerRecords } from "./export";

test(
  "answer records, immutable snapshots, batch enrichment and full filtered exports",
  { skip: !process.env.TEST_DATABASE_URL },
  async (suite) => {
    const db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL!,
      }),
    });
    const suffix = randomUUID();
    const owner = await db.user.create({ data: { id: `answers-${suffix}` } });
    const bank = await db.questionBank.create({
      data: {
        title: "Answer fixture",
        creatorId: owner.id,
        visibility: "PRIVATE",
      },
    });
    const question = await db.question.create({
      data: {
        bankId: bank.id,
        content: "Original question",
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
        explanation: "Fixture",
        status: "PUBLISHED",
      },
    });
    const cardId = `snapshot-${suffix}`;
    const originalEnv = new Map(
      [
        "DIRECTORY_API_BASE_URL",
        "DIRECTORY_INNER_API_KEY",
        "INNER_API_KEY",
      ].map((key) => [key, process.env[key]]),
    );
    const originalFetch = globalThis.fetch;
    try {
      await suite.test(
        "answers persist independently of Directory and replay stays immutable",
        async () => {
          globalThis.fetch = (async () => {
            throw new Error("Directory down");
          }) as typeof fetch;
          const first = await recordAnswerEvent(db, {
            card_id: cardId,
            receiver: "fixture",
            account_id: "a1234555",
            business_id: question.id,
            selected_answer: "a",
            correct_answer: "a",
            answered_at: "2026-10-14T01:00:00Z",
          });
          await db.question.update({
            where: { id: question.id },
            data: { content: "Edited later" },
          });
          const replay = await recordAnswerEvent(db, {
            card_id: cardId,
            receiver: "fixture",
            account_id: "a1234555",
            business_id: question.id,
            selected_answer: "b",
            correct_answer: "a",
            answered_at: "2026-10-14T02:00:00Z",
          });
          assert.equal(first.id, replay.id);
          assert.equal(replay.questionContentSnapshot, "Original question");
          assert.equal(replay.isCorrect, true);
          assert.equal(
            replay.answeredAt.toISOString(),
            "2026-10-14T01:00:00.000Z",
          );
        },
      );
      await suite.test(
        "global sorting and pagination apply to every matching row",
        async () => {
          await db.questionAnswerEvent.createMany({
            data: Array.from({ length: 30 }, (_, index) => ({
              bankId: bank.id,
              questionId: question.id,
              cardId: `fixture-${suffix}-${index}`,
              receiver: "fixture",
              respondentId: "a1234555",
              respondentNameSnapshot: "Fixture",
              respondentEmployeeNoSnapshot: "00123",
              identityStatus: "RESOLVED" as const,
              identityCapturedAt: new Date(),
              selectedAnswer: index % 2 ? "a" : "b",
              correctAnswer: "a",
              isCorrect: index % 2 === 1,
              answeredAt: new Date(Date.UTC(2026, 9, 14, 1, index + 1)),
            })),
          });
          const page1 = await listAnswerRecords(
            db,
            bank.id,
            parseAnswerFilters(new URLSearchParams("sort=incorrect-first")),
          );
          const page2 = await listAnswerRecords(
            db,
            bank.id,
            parseAnswerFilters(
              new URLSearchParams("sort=incorrect-first&page=2"),
            ),
          );
          assert.equal(page1.total, 31);
          assert.equal(page1.items.length, 25);
          assert.equal(page2.items.length, 6);
          assert.ok(page1.items.slice(0, 15).every((row) => !row.isCorrect));
          assert.ok(page2.items.every((row) => row.isCorrect));
          assert.equal(
            new Set([...page1.items, ...page2.items].map((row) => row.id)).size,
            31,
          );
          const filters = parseAnswerFilters(
            new URLSearchParams(
              "q=00123&result=incorrect&from=2026-10-14&to=2026-10-14&sort=time-asc",
            ),
          );
          const filtered = await listAnswerRecords(db, bank.id, filters);
          assert.equal(filtered.total, 15);
          const buffer = await exportAnswerRecords(
            db,
            bank.id,
            bank.title,
            parseAnswerFilters(new URLSearchParams("page=2")),
          );
          const workbook = XLSX.read(buffer, { type: "buffer" });
          assert.equal(
            XLSX.utils.sheet_to_json(workbook.Sheets["答题记录"]).length,
            31,
          );
        },
      );
      await suite.test(
        "profile enrichment failures preserve records and durable backoff",
        async () => {
          await db.schedulerState.deleteMany({
            where: { id: "qa-identities" },
          });
          process.env.DIRECTORY_API_BASE_URL = "http://127.0.0.1:4010";
          let calls = 0;
          let responseAt = 0;
          globalThis.fetch = (async () => {
            calls++;
            responseAt = Date.now();
            return new Response("{}", {
              status: 503,
              headers: { "Retry-After": "3600" },
            });
          }) as typeof fetch;
          await enrichAnswerIdentities(db);
          await enrichAnswerIdentities(db);
          assert.equal(calls, 1);
          assert.equal(
            await db.questionAnswerEvent.count({ where: { bankId: bank.id } }),
            31,
          );
          const checkpoint = await db.schedulerState.findUniqueOrThrow({
            where: { id: "qa-identities" },
          });
          assert.equal(checkpoint.lastErrorCode, "DIRECTORY_HTTP_503");
          assert.ok(Date.parse(checkpoint.cursor!) >= responseAt + 3600000);
        },
      );
      if (process.env.TEST_INNER_API_MOCK_URL)
        await suite.test(
          "actual Directory Mock fills stable identity and never overwrites snapshots",
          async () => {
            globalThis.fetch = originalFetch;
            process.env.DIRECTORY_API_BASE_URL =
              process.env.TEST_INNER_API_MOCK_URL;
            delete process.env.DIRECTORY_INNER_API_KEY;
            delete process.env.INNER_API_KEY;
            await db.schedulerState.update({
              where: { id: "qa-identities" },
              data: { cursor: null },
            });
            await enrichAnswerIdentities(db);
            const enriched = await db.questionAnswerEvent.findUniqueOrThrow({
              where: {
                cardId_respondentId: { cardId, respondentId: "a1234555" },
              },
            });
            assert.equal(enriched.identityStatus, "RESOLVED");
            assert.ok(enriched.respondentNameSnapshot);
            assert.ok(enriched.respondentEmployeeNoSnapshot);
            assert.ok(enriched.respondentUserId);
            assert.ok(enriched.identityCapturedAt);
            const unchanged = await db.questionAnswerEvent.findFirstOrThrow({
              where: { bankId: bank.id, respondentEmployeeNoSnapshot: "00123" },
            });
            assert.equal(unchanged.respondentNameSnapshot, "Fixture");
          },
        );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of originalEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await db.$disconnect();
    }
  },
);
