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
  const boundary = migrations.indexOf("20261015090000_learning_subscription_policy");
  assert.notEqual(boundary, -1);
  const pendingMigrations = latest ? [] : migrations.slice(boundary);
  for (const name of latest ? migrations : migrations.slice(0, boundary))
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
    pendingMigrations: pendingMigrations.map((name) => join(migrationsRoot, name, "migration.sql")),
    async close() {
      await db.$disconnect();
      await sql.query(`DROP SCHEMA "${schema}" CASCADE`);
      await sql.end();
    },
  };
}

test("group subscriptions isolate recipients, preserve ownership and reject restricted content", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const f = await fixture();
  try {
    const user = await f.db.user.create({ data: { uid: "group-owner" } });
    const other = await f.db.user.create({ data: { uid: "group-other" } });
    const actor = { id: user.id, departmentIds: ["test-department"] };
    const outsider = { id: other.id, departmentIds: [] };
    const bank = await f.db.questionBank.create({ data: { title: "Group fixture", creatorId: user.id, visibility: "PUBLIC" } });
    const body = { bankId: bank.id, mode: "FOLLOW_UPDATES", pushTimes: ["10:00"] };
    const personal = await createLearningSubscription(f.db, "QUESTION", actor, body);
    const group = await createLearningSubscription(f.db, "QUESTION", actor, { ...body, targetType: "GROUP", targetId: "00123456" });
    const second = await createLearningSubscription(f.db, "QUESTION", actor, { ...body, targetType: "GROUP", targetId: "90071992547409931234" });
    assert.equal(group.targetId, "00123456");
    assert.equal(group.targetType, "GROUP");
    assert.equal(group.subscriberId, user.id);
    assert.notEqual(group.id, personal.id);
    assert.notEqual(group.id, second.id);
    await assert.rejects(createLearningSubscription(f.db, "QUESTION", actor, { ...body, targetType: "GROUP", targetId: group.targetId }), { status: 409 });
    await assert.rejects(updateLearningSubscription(f.db, "QUESTION", group.id, outsider, { action: "pause" }, group.targetId), { status: 403 });
    await assert.rejects(updateLearningSubscription(f.db, "QUESTION", group.id, actor, { action: "pause" }, second.targetId), { status: 403 });
    await updateLearningSubscription(f.db, "QUESTION", group.id, actor, { action: "pause" }, group.targetId);
    assert.equal((await f.db.subscription.findUniqueOrThrow({ where: { id: personal.id } })).status, personal.status);
    await updateLearningSubscription(f.db, "QUESTION", group.id, actor, { action: "cancel" }, group.targetId);
    assert.equal((await f.db.subscription.findUniqueOrThrow({ where: { id: second.id } })).status, second.status);

    const privateBank = await f.db.questionBank.create({ data: { title: "Private fixture", creatorId: user.id, visibility: "PRIVATE" } });
    await assert.rejects(createLearningSubscription(f.db, "QUESTION", actor, { ...body, bankId: privateBank.id, targetType: "GROUP", targetId: "123456" }), { status: 403 });
    const knowledge = await f.db.knowledgeBank.create({ data: { title: "Department fixture", creatorId: user.id, visibility: "PARTIAL", visibleDepartments: ["test-department"] } });
    await assert.rejects(createLearningSubscription(f.db, "KNOWLEDGE", actor, { ...body, bankId: knowledge.id, targetType: "GROUP", targetId: "123456" }), { status: 403 });
    await f.db.knowledgeBank.update({ where: { id: knowledge.id }, data: { visibility: "PUBLIC" } });
    const knowledgeGroup = await createLearningSubscription(f.db, "KNOWLEDGE", actor, { ...body, bankId: knowledge.id, targetType: "GROUP", targetId: "123456" });
    assert.equal(knowledgeGroup.targetType, "GROUP");
    assert.equal(knowledgeGroup.subscriberId, user.id);
    await assert.rejects(createLearningSubscription(f.db, "KNOWLEDGE", actor, { ...body, bankId: knowledge.id, targetType: "GROUP", targetId: "not-a-group" }), { status: 400 });
  } finally {
    await f.close();
  }
});

test("delivery retries retain the original management URL and idempotent payload", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const f = await fixture();
  const previous = new Map(["APP_PUBLIC_URL", "PUSH_PROVIDER", "PUSH_API_URL"].map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const sent: string[] = [];
  try {
    process.env.APP_PUBLIC_URL = "https://learning.example.test";
    process.env.PUSH_PROVIDER = "generic";
    process.env.PUSH_API_URL = "https://fixture.invalid/push";
    globalThis.fetch = (async (_input, init) => {
      sent.push(String(init?.body));
      return new Response("{}", { status: sent.length === 1 ? 503 : 200 });
    }) as typeof fetch;
    const user = await f.db.user.create({ data: { uid: "management-fixture" } });
    const bank = await f.db.questionBank.create({ data: { title: "管理链接测试", creatorId: user.id, visibility: "PUBLIC" } });
    await f.db.question.create({ data: { bankId: bank.id, content: "Fixture", options: ["A", "B", "C", "D"], correctAnswer: "A", explanation: "Fixture", status: "PUBLISHED" } });
    const sub = await createLearningSubscription(f.db, "QUESTION", { id: user.id, departmentIds: [] }, { bankId: bank.id, mode: "CURRENT_EDITION", targetType: "GROUP", targetId: "00123456" });
    const now = new Date();
    const job = await f.db.deliveryJob.create({ data: { dedupeKey: randomUUID(), kind: "QUESTION", subscriptionId: sub.id, subscriptionGeneration: sub.generation, targetType: "GROUP", targetId: "00123456", scheduleDate: "2026-11-02", pushTime: "09:30", scheduledAt: now, expiresAt: new Date(now.getTime() + 3600000) } });
    await drainDeliveryJobs(f.db, "Asia/Shanghai", "QUESTION");
    assert.equal(sent.length, 1);
    const pending = await f.db.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(pending.status, "PENDING");
    const stored = pending.payload as { payload: { title: string; domain: string; subscriptionManageUrl: string } };
    assert.equal(stored.payload.title, bank.title);
    assert.equal(stored.payload.domain, bank.title);
    assert.equal(stored.payload.subscriptionManageUrl, "https://learning.example.test/group/00123456?tab=subscriptions");
    process.env.APP_PUBLIC_URL = "https://changed.example.test";
    await updateLearningSubscription(f.db, "QUESTION", sub.id, { id: user.id, departmentIds: [] }, { pushOrder: "RANDOM" });
    await f.db.deliveryJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await drainDeliveryJobs(f.db, "Asia/Shanghai", "QUESTION");
    assert.equal(sent.length, 2);
    assert.deepEqual(JSON.parse(sent[0]), JSON.parse(sent[1]));
    assert.equal(JSON.parse(sent[1]).title, `${bank.title} -- [订阅管理](https://learning.example.test/group/00123456?tab=subscriptions)`);
    assert.equal((await f.db.deliveryJob.findUniqueOrThrow({ where: { id: job.id } })).status, "ACCEPTED");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await f.close();
  }
});

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
      for (const migration of f.pendingMigrations) await f.sql.query(await readFile(migration, "utf8"));
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
      await suite.test("sequential defaults follow the visible question and knowledge order", async () => {
        const b = await bank();
        const first = await question(b.id);
        const second = await question(b.id);
        await db.question.update({ where: { id: first.id }, data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
        await db.question.update({ where: { id: second.id }, data: { createdAt: new Date("2026-01-02T00:00:00Z") } });
        const sub = await createLearningSubscription(db, "QUESTION", actor, { bankId: b.id, targetType: "GROUP", targetId: "901001" });
        assert.equal(sub.pushOrder, "SEQUENTIAL");
        assert.equal((await selectLearningQuestion(db, await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })))?.question.id, first.id);
        assert.equal((await deliver(sub.id)).status, "ACCEPTED");
        assert.equal((await selectLearningQuestion(db, await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })))?.question.id, second.id);
        const kb = await db.knowledgeBank.create({ data: { title: "Ordered knowledge", creatorId: actor.id, visibility: "PUBLIC" } });
        const last = await db.knowledgePoint.create({ data: { bankId: kb.id, orderIndex: 9, content: "Last" } });
        const start = await db.knowledgePoint.create({ data: { bankId: kb.id, orderIndex: 0, content: "First" } });
        const ks = await createLearningSubscription(db, "KNOWLEDGE", actor, { bankId: kb.id, mode: "CURRENT_EDITION", targetType: "GROUP", targetId: "901001" });
        assert.equal(ks.pushOrder, "SEQUENTIAL");
        assert.equal((await selectLearningKnowledge(db, await db.knowledgeSubscription.findUniqueOrThrow({ where: { id: ks.id } })))?.id, start.id);
        assert.equal((await deliver(ks.id, "KNOWLEDGE")).status, "ACCEPTED");
        assert.equal((await selectLearningKnowledge(db, await db.knowledgeSubscription.findUniqueOrThrow({ where: { id: ks.id } })))?.id, last.id);
      });
      await suite.test("random question delivery exhausts each frozen round once and stops", async () => {
        const b = await bank();
        const questions = await Promise.all(Array.from({ length: 5 }, () => question(b.id)));
        const sub = await createLearningSubscription(db, "QUESTION", actor, { bankId: b.id, mode: "CURRENT_EDITION", pushOrder: "RANDOM", endCondition: "REPEAT_N_TIMES", repeatCount: 2, targetType: "GROUP", targetId: "901002" });
        const extra = await question(b.id);
        for (let index = 0; index < 10; index++) assert.equal((await deliver(sub.id)).status, "ACCEPTED");
        for (const cycle of [0, 1]) {
          const logs = await db.pushLog.findMany({ where: { subscriptionId: sub.id, cycle } });
          assert.equal(logs.length, 5);
          assert.deepEqual(new Set(logs.map((log) => log.questionId)), new Set(questions.map((q) => q.id)));
          assert.ok(!logs.some((log) => log.questionId === extra.id));
        }
        const finished = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
        assert.equal(finished.status, "COMPLETED");
        assert.equal(await selectLearningQuestion(db, finished), null);
        assert.equal((await deliver(sub.id)).status, "CANCELLED");
      });
      await suite.test("random knowledge delivery never repeats, and order edits retain history", async () => {
        const kb = await db.knowledgeBank.create({ data: { title: "Random knowledge", creatorId: actor.id, visibility: "PUBLIC" } });
        const points = await Promise.all(Array.from({ length: 4 }, (_, orderIndex) => db.knowledgePoint.create({ data: { bankId: kb.id, orderIndex, content: `Point ${orderIndex}` } })));
        const sub = await createLearningSubscription(db, "KNOWLEDGE", actor, { bankId: kb.id, mode: "CURRENT_EDITION", targetType: "GROUP", targetId: "901003" });
        const original = await db.knowledgeSubscription.findUniqueOrThrow({ where: { id: sub.id } });
        assert.equal((await deliver(sub.id, "KNOWLEDGE")).status, "ACCEPTED");
        const edited = await updateLearningSubscription(db, "KNOWLEDGE", sub.id, actor, { pushOrder: "RANDOM" });
        assert.equal(edited.pushOrder, "RANDOM");
        assert.equal(edited.generation, sub.generation);
        assert.deepEqual((await db.knowledgeSubscription.findUniqueOrThrow({ where: { id: sub.id } })).editionPointIds, original.editionPointIds);
        await assert.rejects(updateLearningSubscription(db, "KNOWLEDGE", sub.id, actor, { pushOrder: "random" }), { status: 400 });
        for (let index = 0; index < 3; index++) assert.equal((await deliver(sub.id, "KNOWLEDGE")).status, "ACCEPTED");
        const logs = await db.knowledgePushLog.findMany({ where: { subscriptionId: sub.id } });
        assert.equal(logs.length, 4);
        assert.deepEqual(new Set(logs.map((log) => log.knowledgePointId)), new Set(points.map((p) => p.id)));
        assert.equal((await db.knowledgeSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status, "COMPLETED");
      });
      await suite.test("fixed schedules allow order changes without resetting question progress", async () => {
        const b = await bank();
        await db.questionBank.update({ where: { id: b.id }, data: { subscriptionScheduleMode: "FIXED", subscriptionPushTimes: ["09:30"] } });
        await question(b.id); await question(b.id);
        const sub = await createLearningSubscription(db, "QUESTION", actor, { bankId: b.id, targetType: "GROUP", targetId: "901004" });
        assert.equal((await deliver(sub.id)).status, "ACCEPTED");
        const edited = await updateLearningSubscription(db, "QUESTION", sub.id, actor, { pushOrder: "RANDOM" }, "901004");
        assert.equal(edited.pushOrder, "RANDOM");
        assert.equal(edited.generation, sub.generation);
        assert.deepEqual(await questionProgress(db, await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })), { questionCount: 2, pushedCount: 1 });
        await assert.rejects(updateLearningSubscription(db, "QUESTION", sub.id, actor, { pushTimes: ["12:00"] }), { status: 400 });
        assert.equal((await deliver(sub.id)).status, "ACCEPTED");
        assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status, "COMPLETED");
        await assert.rejects(updateLearningSubscription(db, "QUESTION", sub.id, actor, { pushOrder: "SEQUENTIAL" }), { status: 409 });
      });
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
            pushOrder: "RANDOM",
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
