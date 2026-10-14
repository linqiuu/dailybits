import type { PrismaClient } from "../../generated/prisma/client";
import type { KnowledgePushPayload, TargetType } from "../../types";
import { pushToTarget } from "../push/adapter";
import { selectLearningKnowledge, settleKnowledgeSubscription } from "../subscriptions/lifecycle";

type KnowledgeSubscriptionForPush = Awaited<
  ReturnType<PrismaClient["knowledgeSubscription"]["findMany"]>
>[number] & {
  bank: {
    id: string;
    title: string;
  };
};

function getDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function resolveKnowledgeReceiver(
  prisma: PrismaClient,
  targetType: TargetType,
  targetId: string,
): Promise<string> {
  if (targetType === "GROUP") {
    return targetId;
  }
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { uid: true },
  });
  return user?.uid ?? targetId;
}

export async function selectNextKnowledgePoint(
  prisma: PrismaClient,
  subscriptionId: string,
  bankId: string,
) {
  const sub = await prisma.knowledgeSubscription.findUnique({ where: { id: subscriptionId } });
  return sub?.bankId === bankId ? selectLearningKnowledge(prisma, sub) : null;
}

export async function pushKnowledgeToTarget(
  payload: KnowledgePushPayload,
): Promise<boolean> {
  return pushToTarget(payload);
}

export function buildKnowledgePushPayload(input: {
  receiver: string;
  title: string;
  content: string;
  knowledgeBankId: string;
  knowledgePointId: string;
  idempotencyKey?: string;
}): KnowledgePushPayload {
  return {
    receiver: input.receiver,
    title: input.title,
    items: [input.content],
    knowledgeBankId: input.knowledgeBankId,
    knowledgePointId: input.knowledgePointId,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

export async function pushKnowledgeSubscription(
  prisma: PrismaClient,
  sub: KnowledgeSubscriptionForPush,
  pushTime: string,
  timezone: string,
): Promise<boolean> {
  if (!sub.isActive) return false;
  const pushDate = getDateInTimezone(new Date(), timezone);
  const alreadyPushed = await prisma.knowledgePushLog.findUnique({
    where: {
      subscriptionId_pushDate_pushTime: {
        subscriptionId: sub.id,
        pushDate,
        pushTime,
      },
    },
  });
  if (alreadyPushed) return false;

  const point = await selectNextKnowledgePoint(prisma, sub.id, sub.bankId);
  if (!point) {
    await settleKnowledgeSubscription(prisma, sub.id, sub.generation);
    return false;
  }

  const receiver = await resolveKnowledgeReceiver(
    prisma,
    sub.targetType as TargetType,
    sub.targetId,
  );
  const success = await pushKnowledgeToTarget(
    buildKnowledgePushPayload({
      receiver,
      title: sub.bank.title,
      content: point.content,
      knowledgeBankId: sub.bankId,
      knowledgePointId: point.id,
      idempotencyKey: [
        "dailybits",
        "knowledge",
        sub.id,
        pushDate,
        pushTime,
        point.id,
      ].join(":"),
    }),
  );

  if (!success) return false;

  await prisma.knowledgePushLog.create({
    data: {
      subscriptionId: sub.id,
      generation: sub.generation,
      targetType: sub.targetType,
      targetId: sub.targetId,
      bankId: sub.bankId,
      knowledgePointId: point.id,
      contentSnapshot: point.content,
      pushDate,
      pushTime,
    },
  });

  await settleKnowledgeSubscription(prisma, sub.id, sub.generation);

  console.log(`[Knowledge] Pushed ${sub.bankId} to ${sub.targetType}:${sub.targetId}`);
  return true;
}

export async function runDueKnowledgeSubscriptions(
  prisma: PrismaClient,
  currentTime: string,
  timezone: string,
): Promise<void> {
  const subscriptions = await prisma.knowledgeSubscription.findMany({
    where: {
      isActive: true,
      pushTimes: { has: currentTime },
    },
    include: {
      bank: {
        select: { id: true, title: true },
      },
    },
  });

  for (const sub of subscriptions) {
    try {
      await pushKnowledgeSubscription(prisma, sub, currentTime, timezone);
    } catch (error) {
      console.error(`[Knowledge] Error for subscription ${sub.id}:`, error);
    }
  }
}
