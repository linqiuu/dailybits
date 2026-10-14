import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  createLearningSubscription,
  updateLearningSubscription,
} from "../src/lib/subscriptions/service";
import {
  selectLearningQuestion,
  settleQuestionSubscription,
} from "../src/lib/subscriptions/lifecycle";

test(
  "JSON sync preserves stable IDs and never reactivates completed, paused or cancelled subscriptions",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const suffix = randomUUID();
    const folder = await mkdtemp(join(tmpdir(), "dailybits-policy-sync-"));
    const file = join(folder, `policy-${suffix}.json`);
    const db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL!,
      }),
    });
    const owner = await db.user.create({ data: { uid: `sync-${suffix}` } });
    const actor = { id: owner.id, departmentIds: [] };
    let bankId: string | undefined;
    async function sync(questions: Array<Record<string, unknown>>) {
      await writeFile(
        file,
        JSON.stringify({
          type: "question",
          title: `Synthetic sync fixture ${suffix}`,
          visibility: "PUBLIC",
          questions,
        }),
        "utf8",
      );
      await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/sync-question-banks.ts",
          "--questions-only",
        ],
        {
          cwd: process.cwd(),
          timeout: 30000,
          env: {
            ...process.env,
            DATABASE_URL: process.env.TEST_DATABASE_URL!,
            BANK_SYNC_OWNER_UID: owner.uid!,
            QUESTION_SYNC_OWNER_UID: owner.uid!,
            KNOWLEDGE_SYNC_OWNER_UID: owner.uid!,
            BANK_CONTENT_DIR: folder,
            QUESTION_BANKS_DIR: folder,
            KNOWLEDGE_BANKS_DIR: join(folder, "no-knowledge"),
          },
        },
      );
    }
    const original = {
      content: "Stable fixture",
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
      explanation: "Fixture",
    };
    try {
      await sync([original]);
      const bank = await db.questionBank.findFirstOrThrow({
        where: { creatorId: owner.id },
      });
      bankId = bank.id;
      const question = await db.question.findFirstOrThrow({
        where: { bankId },
      });
      await sync([{ ...original, id: "stable-one" }]);
      assert.equal(
        (await db.question.findFirstOrThrow({ where: { bankId } })).id,
        question.id,
      );
      const finite = await createLearningSubscription(db, "QUESTION", actor, {
        bankId,
        mode: "CURRENT_EDITION",
      });
      await db.pushLog.create({
        data: {
          subscriptionId: finite.id,
          targetId: owner.id,
          questionId: question.id,
        },
      });
      await settleQuestionSubscription(db, finite.id, finite.generation);
      const cancelled = await createLearningSubscription(
        db,
        "QUESTION",
        actor,
        {
          bankId,
          mode: "FOLLOW_UPDATES",
          targetType: "GROUP",
          targetId: "700001",
        },
      );
      await updateLearningSubscription(db, "QUESTION", cancelled.id, actor, {
        action: "cancel",
      });
      const paused = await createLearningSubscription(db, "QUESTION", actor, {
        bankId,
        mode: "FOLLOW_UPDATES",
        targetType: "GROUP",
        targetId: "700002",
      });
      await updateLearningSubscription(db, "QUESTION", paused.id, actor, {
        action: "pause",
      });
      const follow = await createLearningSubscription(db, "QUESTION", actor, {
        bankId,
        mode: "FOLLOW_UPDATES",
        targetType: "GROUP",
        targetId: "700003",
      });
      await db.pushLog.create({
        data: {
          subscriptionId: follow.id,
          targetType: "GROUP",
          targetId: "700003",
          questionId: question.id,
        },
      });
      await settleQuestionSubscription(db, follow.id, follow.generation);
      await sync([
        {
          ...original,
          id: "stable-one",
          content: "Edited fixture",
          correctAnswer: "B",
        },
        { ...original, id: "stable-two", content: "New fixture" },
      ]);
      const all = await db.question.findMany({ where: { bankId } });
      assert.equal(all.length, 2);
      assert.equal(
        all.find((item) => item.content === "Edited fixture")?.id,
        question.id,
      );
      assert.equal(
        (await db.subscription.findUniqueOrThrow({ where: { id: finite.id } }))
          .status,
        "COMPLETED",
      );
      assert.equal(
        (
          await db.subscription.findUniqueOrThrow({
            where: { id: cancelled.id },
          })
        ).status,
        "CANCELLED",
      );
      assert.equal(
        (await db.subscription.findUniqueOrThrow({ where: { id: paused.id } }))
          .status,
        "PAUSED",
      );
      const following = await db.subscription.findUniqueOrThrow({
        where: { id: follow.id },
      });
      assert.equal(following.status, "WAITING");
      assert.equal(
        (await selectLearningQuestion(db, following))?.question.content,
        "New fixture",
      );
    } finally {
      if (bankId) await db.questionBank.delete({ where: { id: bankId } });
      await db.user.delete({ where: { id: owner.id } });
      await db.$disconnect();
      const resolved = resolve(folder);
      assert.ok(
        resolved.startsWith(resolve(tmpdir()) + sep) &&
          resolved.includes("dailybits-policy-sync-"),
      );
      await rm(resolved, { recursive: true, force: true });
    }
  },
);
