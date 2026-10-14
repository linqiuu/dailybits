import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { migrateUserTargets } from "../identity-migration";
import { AnswerEventError, recordAnswerEvent } from "../qa-events";
import { claimJob, drainDeliveryJobs, enqueueDueJobs } from "./jobs";

test("PostgreSQL delivery, identity and answer recovery", { skip: !process.env.TEST_DATABASE_URL }, async (suite) => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const suffix = randomUUID();
  const user = await db.user.create({ data: { id: `test-${suffix}`, uid: `uid-${suffix}` } });
  const bank = await db.questionBank.create({ data: { title: "Delivery fixture", creatorId: user.id, visibility: "PUBLIC" } });
  const question = await db.question.create({ data: { bankId: bank.id, content: "Fixture question", options: ["A", "B", "C", "D"], correctAnswer: "A", explanation: "Fixture", status: "PUBLISHED" } });
  const sub = await db.subscription.create({ data: { targetType: "USER", targetId: user.id, subscriberId: user.id, bankId: bank.id, editionQuestionIds: [question.id], pushTimes: ["09:30"], startedAt: new Date("2026-10-12T00:00:00Z"), createdAt: new Date("2026-10-12T00:00:00Z") } });
  try {
    await suite.test("missed minutes are caught up once, weekends are excluded", async () => {
      await db.schedulerState.upsert({ where: { id: "main" }, create: { id: "main", lastTickAt: new Date("2026-10-13T01:29:00Z") }, update: { lastTickAt: new Date("2026-10-13T01:29:00Z") } });
      await enqueueDueJobs(db, new Date("2026-10-13T01:35:00Z"), "Asia/Shanghai");
      await enqueueDueJobs(db, new Date("2026-10-13T01:36:00Z"), "Asia/Shanghai");
      assert.equal(await db.deliveryJob.count({ where: { subscriptionId: sub.id } }), 1);
      await db.schedulerState.update({ where: { id: "main" }, data: { lastTickAt: new Date("2026-10-17T01:29:00Z") } });
      await enqueueDueJobs(db, new Date("2026-10-17T01:35:00Z"), "Asia/Shanghai");
      assert.equal(await db.deliveryJob.count({ where: { subscriptionId: sub.id } }), 1);
      await db.deliveryJob.updateMany({ where: { subscriptionId: sub.id }, data: { status: "CANCELLED" } });
    });
    await suite.test("concurrent workers claim once and do not overtake a retry", async () => {
      const now = new Date();
      const common = { kind: "QUESTION" as const, subscriptionId: sub.id, targetType: "USER" as const, targetId: user.id, scheduleDate: "2026-10-13", pushTime: "09:30", expiresAt: new Date(now.getTime() + 3600000) };
      const first = await db.deliveryJob.create({ data: { ...common, dedupeKey: `first-${suffix}`, scheduledAt: now, nextAttemptAt: new Date(now.getTime() + 60000) } });
      const second = await db.deliveryJob.create({ data: { ...common, dedupeKey: `second-${suffix}`, scheduledAt: new Date(now.getTime() + 1), nextAttemptAt: now } });
      assert.equal(await claimJob(db, now, "QUESTION"), null);
      await db.deliveryJob.update({ where: { id: first.id }, data: { nextAttemptAt: now } });
      const claims = await Promise.all([claimJob(db, now, "QUESTION"), claimJob(db, now, "QUESTION")]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(claims.find(Boolean)?.id, first.id);
      await db.deliveryJob.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { status: "CANCELLED", lockedAt: null, lockToken: null } });
    });
    await suite.test("saved acceptance recovers local history without resending", async () => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async () => { calls++; throw new Error("Must not send again"); }) as typeof fetch;
      const now = new Date();
      const job = await db.deliveryJob.create({ data: { kind: "QUESTION", subscriptionId: sub.id, targetType: "USER", targetId: user.id, dedupeKey: `receipt-${suffix}`, scheduleDate: "2026-10-13", pushTime: "09:30", scheduledAt: now, expiresAt: new Date(now.getTime() - 1000), nextAttemptAt: now, receipt: { ok: true, status: "accepted", messageId: "fixture-card" }, payload: { payload: { receiver: user.uid!, title: bank.title, question: question.content, options: ["A", "B", "C", "D"], correctAnswer: "A", explanation: "Fixture", businessId: question.id }, cycle: 0, generation: 0 } } });
      try { await drainDeliveryJobs(db, "Asia/Shanghai", "QUESTION"); }
      finally { globalThis.fetch = originalFetch; }
      assert.equal(calls, 0);
      assert.equal((await db.deliveryJob.findUniqueOrThrow({ where: { id: job.id } })).status, "ACCEPTED");
      assert.equal(await db.pushLog.count({ where: { deliveryJobId: job.id } }), 1);
      await drainDeliveryJobs(db, "Asia/Shanghai", "QUESTION");
      assert.equal(await db.pushLog.count({ where: { deliveryJobId: job.id } }), 1);
    });
    await suite.test("answers are idempotent and correctness is derived, not trusted", async () => {
      const body = { card_id: `card-${suffix}`, receiver: user.uid, account_id: user.id, business_id: question.id, selected_answer: "b", correct_answer: "a", is_correct: true };
      const first = await recordAnswerEvent(db, body);
      const replay = await recordAnswerEvent(db, body);
      assert.equal(first.id, replay.id);
      assert.equal(first.isCorrect, false);
      await assert.rejects(recordAnswerEvent(db, {}), (error: unknown) => error instanceof AnswerEventError && error.status === 400);
    });
    await suite.test("identity migration updates user targets and leaves group IDs alone", async () => {
      const group = await db.subscription.create({ data: { targetType: "GROUP", targetId: user.id, bankId: bank.id, isActive: false, status: "CANCELLED" } });
      const newId = `auth-${suffix}`;
      await db.$transaction(async (tx) => {
        await migrateUserTargets(tx, user.id, newId);
        await tx.user.update({ where: { id: user.id }, data: { id: newId } });
      });
      assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).targetId, newId);
      assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: group.id } })).targetId, user.id);
      assert.equal((await db.questionBank.findUniqueOrThrow({ where: { id: bank.id } })).creatorId, newId);
      assert.equal(await db.pushLog.count({ where: { targetId: user.id, targetType: "USER" } }), 0);
      assert.equal(await db.questionAnswerEvent.count({ where: { respondentId: newId } }), 1);
      await db.subscription.update({ where: { id: sub.id }, data: { isActive: false, status: "CANCELLED" } });
    });
  } finally { await db.$disconnect(); }
});
