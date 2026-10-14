import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import {
  createLearningSubscription,
  updateLearningSubscription,
} from "./service";
import {
  selectLearningQuestion,
  selectLearningKnowledge,
  questionProgress,
} from "./lifecycle";
import { drainDeliveryJobs } from "../push/jobs";

const migrationsRoot = join(process.cwd(), "prisma", "migrations");
async function fixture(latest = true) {
  const schema = "policy_" + randomUUID().replaceAll("-", "");
  const sql = new Client({ connectionString: process.env.TEST_DATABASE_URL! });
  await sql.connect();
  await sql.query(`CREATE SCHEMA "${schema}"`);
  await sql.query(`SET search_path TO "${schema}"`);
  const migrations = (await readdir(migrationsRoot))
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of latest ? migrations : migrations.slice(0, -1))
    await sql.query(
      await readFile(join(migrationsRoot, name, "migration.sql"), "utf8"),
    );
  const db = new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: process.env.TEST_DATABASE_URL!,
        options: `-c search_path=${schema}`,
      },
      { schema },
    ),
  });
  return {
    db,
    sql,
    latest: join(migrationsRoot, migrations.at(-1)!, "migration.sql"),
    async close() {
      await db.$disconnect();
      await sql.query(`DROP SCHEMA "${schema}" CASCADE`);
      await sql.end();
    },
  };
}

test(
  "legacy migration freezes active editions and never revives inactive subscriptions",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const f = await fixture(false);
    try {
      await f.sql
        .query(`INSERT INTO "User" (id, uid) VALUES ('legacy-user', 'legacy-uid');
      INSERT INTO "QuestionBank" (id, title, "creatorId", "updatedAt") VALUES ('legacy-bank', 'Fixture', 'legacy-user', now());
      INSERT INTO "Question" (id, "bankId", content, options, "correctAnswer", explanation, status, "updatedAt") VALUES ('published', 'legacy-bank', 'Question', '[]', 'A', '', 'PUBLISHED', now()), ('draft', 'legacy-bank', 'Draft', '[]', 'A', '', 'DRAFT', now());
      INSERT INTO "Subscription" (id, "targetId", "bankId", "isActive", generation, "createdAt") VALUES ('legacy-active', 'legacy-user', 'legacy-bank', true, 4, '2026-10-01'), ('legacy-stopped', 'other-user', 'legacy-bank', false, 0, '2026-10-01');
      INSERT INTO "KnowledgeBank" (id, title, "creatorId", "updatedAt") VALUES ('legacy-knowledge', 'Fixture', 'legacy-user', now());
      INSERT INTO "KnowledgeSubscription" (id, "targetId", "bankId", "isActive", "updatedAt") VALUES ('legacy-knowledge-stopped', 'legacy-user', 'legacy-knowledge', false, now());
      INSERT INTO "DeliveryJob" (id, "dedupeKey", kind, "subscriptionId", "targetType", "targetId", "scheduleDate", "pushTime", "scheduledAt", "expiresAt", "updatedAt") VALUES ('legacy-job', 'legacy-key', 'QUESTION', 'legacy-active', 'USER', 'legacy-user', '2026-10-14', '09:30', now(), now() + interval '1 hour', now());`);
      await f.sql.query(await readFile(f.latest, "utf8"));
      const active = await f.db.subscription.findUniqueOrThrow({
        where: { id: "legacy-active" },
      });
      assert.equal(active.status, "ACTIVE");
      assert.equal(active.mode, "CURRENT_EDITION");
      assert.deepEqual(active.editionQuestionIds, ["published"]);
      assert.equal(active.startedAt.toISOString(), "2026-10-01T00:00:00.000Z");
      assert.equal(
        (
          await f.db.subscription.findUniqueOrThrow({
            where: { id: "legacy-stopped" },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal(
        (
          await f.db.knowledgeSubscription.findUniqueOrThrow({
            where: { id: "legacy-knowledge-stopped" },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal(
        (
          await f.db.deliveryJob.findUniqueOrThrow({
            where: { id: "legacy-job" },
          })
        ).subscriptionGeneration,
        4,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "learning lifecycle delivers frozen editions and follows only unseen content",
  { skip: !process.env.TEST_DATABASE_URL },
  async (suite) => {
    const f = await fixture();
    const db = f.db;
    const user = await db.user.create({ data: { uid: "policy-fixture" } });
    const actor = { id: user.id, departmentIds: [] };
    const fetch = globalThis.fetch;
    const env = new Map(
      ["PUSH_PROVIDER", "PUSH_API_URL"].map((key) => [key, process.env[key]]),
    );
    process.env.PUSH_PROVIDER = "generic";
    process.env.PUSH_API_URL = "https://fixture.invalid/push";
    const sent: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    async function bank() {
      return db.questionBank.create({
        data: {
          creatorId: actor.id,
          title: "Synthetic policy fixture",
          visibility: "PUBLIC",
        },
      });
    }
    async function question(
      bankId: string,
      status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
    ) {
      return db.question.create({
        data: {
          bankId,
          content: randomUUID(),
          options: ["A", "B", "C", "D"],
          correctAnswer: "A",
          explanation: "Fixture",
          status,
        },
      });
    }
    async function deliver(
      id: string,
      kind: "QUESTION" | "KNOWLEDGE" = "QUESTION",
      generation?: number,
    ) {
      const sub =
        kind === "QUESTION"
          ? await db.subscription.findUniqueOrThrow({ where: { id } })
          : await db.knowledgeSubscription.findUniqueOrThrow({ where: { id } });
      const now = new Date();
      const nonce = randomUUID();
      const job = await db.deliveryJob.create({
        data: {
          dedupeKey: nonce,
          kind,
          subscriptionId: id,
          subscriptionGeneration: generation ?? sub.generation,
          targetType: sub.targetType,
          targetId: sub.targetId,
          scheduleDate: "2026-10-14",
          pushTime: nonce,
          scheduledAt: now,
          expiresAt: new Date(now.getTime() + 3600000),
          nextAttemptAt: now,
        },
      });
      await drainDeliveryJobs(db, "Asia/Shanghai", kind);
      return db.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
    }
    try {
    await suite.test("concurrent subscribe requests cannot create duplicate or bypass quota", async () => {
      const b = await bank(); await question(b.id);
      const body = { bankId: b.id, mode: "FOLLOW_UPDATES", targetType: "GROUP", targetId: "900001" };
      const results = await Promise.allSettled([createLearningSubscription(db, "QUESTION", actor, body), createLearningSubscription(db, "QUESTION", actor, body)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(results.filter(result => result.status === "rejected").length, 1);
      for (let index = 0; index < 5; index++) {
        const b = await bank(); await question(b.id);
        const sub = await createLearningSubscription(db, "QUESTION", actor, { bankId: b.id, mode: "FOLLOW_UPDATES", targetType: "GROUP", targetId: "900002" });
        await updateLearningSubscription(db, "QUESTION", sub.id, actor, { action: "pause" }, "900002");
      }
      const extra = await bank(); await question(extra.id);
      await assert.rejects(createLearningSubscription(db, "QUESTION", actor, { bankId: extra.id, mode: "FOLLOW_UPDATES", targetType: "GROUP", targetId: "900002" }));
    });
    await suite.test("an in-flight acceptance preserves history without undoing cancellation", async () => {
      const b = await bank(); await question(b.id);
      const sub = await createLearningSubscription(db, "QUESTION", actor, { bankId: b.id, mode: "FOLLOW_UPDATES", targetType: "GROUP", targetId: "900003" });
      const stub = globalThis.fetch;
      globalThis.fetch = (async () => {
        await updateLearningSubscription(db, "QUESTION", sub.id, actor, { action: "cancel" });
        return new Response("{}", { status: 200 });
      }) as typeof fetch;
      try { assert.equal((await deliver(sub.id)).status, "ACCEPTED"); }
      finally { globalThis.fetch = stub; }
      const cancelled = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      assert.equal(cancelled.status, "CANCELLED"); assert.equal(cancelled.isActive, false);
      assert.equal(await db.pushLog.count({ where: { subscriptionId: sub.id } }), 1);
    });
      await suite.test(
        "one-time edition excludes mid-course additions and later publication",
        async () => {
          const b = await bank();
          const first = await question(b.id);
          const second = await question(b.id);
          const draft = await question(b.id, "DRAFT");
          const sub = await createLearningSubscription(db, "QUESTION", actor, {
            bankId: b.id,
            mode: "CURRENT_EDITION",
          });
          await question(b.id);
          await db.question.update({
            where: { id: draft.id },
            data: { status: "PUBLISHED" },
          });
          assert.equal((await deliver(sub.id)).status, "ACCEPTED");
          assert.equal((await deliver(sub.id)).status, "ACCEPTED");
          const finished = await db.subscription.findUniqueOrThrow({
            where: { id: sub.id },
          });
          assert.equal(finished.status, "COMPLETED");
          assert.equal(finished.isActive, false);
          assert.ok(finished.completedAt);
          assert.deepEqual(
            new Set(
              (
                await db.pushLog.findMany({ where: { subscriptionId: sub.id } })
              ).map((log) => log.questionId),
            ),
            new Set([first.id, second.id]),
          );
          assert.deepEqual(await questionProgress(db, finished), {
            questionCount: 2,
            pushedCount: 2,
          });
          await question(b.id);
          assert.equal(await selectLearningQuestion(db, finished), null);
          assert.equal((await deliver(sub.id)).status, "CANCELLED");
          await assert.rejects(
            updateLearningSubscription(db, "QUESTION", sub.id, actor, {
              action: "resume",
            }),
          );
        },
      );
      await suite.test(
        "continuous subscriptions wait, ignore edits and never revive cancellation",
        async () => {
          const b = await bank();
          const original = await question(b.id);
          const sub = await createLearningSubscription(db, "QUESTION", actor, {
            bankId: b.id,
            mode: "FOLLOW_UPDATES",
          });
          await deliver(sub.id);
          let live = await db.subscription.findUniqueOrThrow({
            where: { id: sub.id },
          });
          assert.equal(live.status, "WAITING");
          assert.equal(live.isActive, true);
          await db.question.update({
            where: { id: original.id },
            data: { content: "Edited question", correctAnswer: "B" },
          });
          assert.equal(await selectLearningQuestion(db, live), null);
          const added = await question(b.id);
          assert.equal(
            (await selectLearningQuestion(db, live))?.question.id,
            added.id,
          );
          await deliver(sub.id);
          await updateLearningSubscription(db, "QUESTION", sub.id, actor, {
            action: "cancel",
          });
          await question(b.id);
          live = await db.subscription.findUniqueOrThrow({
            where: { id: sub.id },
          });
          assert.equal(live.status, "CANCELLED");
          assert.equal(await selectLearningQuestion(db, live), null);
          await assert.rejects(
            updateLearningSubscription(db, "QUESTION", sub.id, actor, {
              action: "resume",
            }),
          );
          const restarted = await createLearningSubscription(
            db,
            "QUESTION",
            actor,
            { bankId: b.id, mode: "FOLLOW_UPDATES" },
          );
          assert.equal(restarted.generation, 1);
          const before = sent.length;
          assert.equal(
            (await deliver(sub.id, "QUESTION", 0)).status,
            "CANCELLED",
          );
          assert.equal(sent.length, before);
          await deliver(sub.id);
          assert.equal(
            (await db.subscription.findUniqueOrThrow({ where: { id: sub.id } }))
              .status,
            "WAITING",
          );
          assert.equal(
            await db.pushLog.count({ where: { subscriptionId: sub.id } }),
            3,
          );
        },
      );
      await suite.test(
        "review rounds retain the frozen scope and stop after the configured total",
        async () => {
          const b = await bank();
          await question(b.id);
          await question(b.id);
          const sub = await createLearningSubscription(db, "QUESTION", actor, {
            bankId: b.id,
            mode: "CURRENT_EDITION",
            endCondition: "REPEAT_N_TIMES",
            repeatCount: 3,
          });
          await question(b.id);
          for (let index = 0; index < 6; index++)
            assert.equal((await deliver(sub.id)).status, "ACCEPTED");
          const final = await db.subscription.findUniqueOrThrow({
            where: { id: sub.id },
          });
          assert.equal(final.currentCycle, 2);
          assert.equal(final.status, "COMPLETED");
          assert.equal(
            await db.pushLog.count({ where: { subscriptionId: sub.id } }),
            6,
          );
          assert.equal((await deliver(sub.id)).status, "CANCELLED");
        },
      );
      await suite.test(
        "paused subscriptions preserve scope, ownership and quota reservation",
        async () => {
          const b = await bank();
          await question(b.id);
          const sub = await createLearningSubscription(db, "QUESTION", actor, {
            bankId: b.id,
            targetType: "GROUP",
            targetId: "987654321",
            mode: "CURRENT_EDITION",
          });
          const before = sent.length;
          await updateLearningSubscription(
            db,
            "QUESTION",
            sub.id,
            actor,
            { action: "pause" },
            "987654321",
          );
          assert.equal((await deliver(sub.id)).status, "CANCELLED");
          assert.equal(sent.length, before);
          await assert.rejects(
            createLearningSubscription(db, "QUESTION", actor, {
              bankId: b.id,
              targetType: "GROUP",
              targetId: "987654321",
            }),
          );
          await assert.rejects(
            updateLearningSubscription(
              db,
              "QUESTION",
              sub.id,
              { id: "outsider", departmentIds: [] },
              { action: "resume" },
              "987654321",
            ),
          );
          const resumed = await updateLearningSubscription(
            db,
            "QUESTION",
            sub.id,
            actor,
            { action: "resume" },
            "987654321",
          );
          assert.equal(resumed.status, "ACTIVE");
          assert.equal((await deliver(sub.id)).status, "ACCEPTED");
        },
      );
      await suite.test(
        "knowledge subscriptions stop or wait without wrapping back to old cards",
        async () => {
          const b = await db.knowledgeBank.create({
            data: {
              creatorId: actor.id,
              title: "Knowledge fixture",
              visibility: "PUBLIC",
            },
          });
          await db.knowledgePoint.create({
            data: { bankId: b.id, content: "Original", orderIndex: 1 },
          });
          const finite = await createLearningSubscription(
            db,
            "KNOWLEDGE",
            actor,
            { bankId: b.id, mode: "CURRENT_EDITION" },
          );
          await db.knowledgePoint.create({
            data: { bankId: b.id, content: "Added later", orderIndex: 2 },
          });
          await deliver(finite.id, "KNOWLEDGE");
          assert.equal(
            (
              await db.knowledgeSubscription.findUniqueOrThrow({
                where: { id: finite.id },
              })
            ).status,
            "COMPLETED",
          );
          const follower = await createLearningSubscription(
            db,
            "KNOWLEDGE",
            actor,
            { bankId: b.id, mode: "FOLLOW_UPDATES" },
          );
          await deliver(follower.id, "KNOWLEDGE");
          let live = await db.knowledgeSubscription.findUniqueOrThrow({
            where: { id: follower.id },
          });
          assert.equal(live.status, "WAITING");
          assert.equal(await selectLearningKnowledge(db, live), null);
          await db.knowledgePoint.updateMany({
            where: { bankId: b.id },
            data: { content: "Edited" },
          });
          assert.equal(await selectLearningKnowledge(db, live), null);
          await db.knowledgePoint.create({
            data: {
              bankId: b.id,
              content: "New low-index card",
              orderIndex: 0,
            },
          });
          await deliver(follower.id, "KNOWLEDGE");
          live = await db.knowledgeSubscription.findUniqueOrThrow({
            where: { id: follower.id },
          });
          assert.equal(live.status, "WAITING");
          await updateLearningSubscription(
            db,
            "KNOWLEDGE",
            follower.id,
            actor,
            { action: "cancel" },
          );
          assert.equal(
            (await deliver(follower.id, "KNOWLEDGE")).status,
            "CANCELLED",
          );
        },
      );
    } finally {
      globalThis.fetch = fetch;
      for (const [key, value] of env) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await f.close();
    }
  },
);
