import type { PrismaClient } from "../../generated/prisma/client";
import type { KnowledgePushPayload, TargetType } from "../../types";

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
  const lastLog = await prisma.knowledgePushLog.findFirst({
    where: { subscriptionId },
    orderBy: { pushedAt: "desc" },
    include: {
      knowledgePoint: {
        select: { orderIndex: true },
      },
    },
  });

  if (lastLog?.knowledgePoint) {
    const next = await prisma.knowledgePoint.findFirst({
      where: {
        bankId,
        orderIndex: { gt: lastLog.knowledgePoint.orderIndex },
      },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });
    if (next) return next;
  }

  return prisma.knowledgePoint.findFirst({
    where: { bankId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });
}

export async function pushKnowledgeToTarget(
  payload: KnowledgePushPayload,
): Promise<boolean> {
  const url = process.env.PUSH_API_URL;
  if (!url) {
    console.log("[PUSH KNOWLEDGE MOCK]", JSON.stringify(payload, null, 2));
    return true;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.ok;
}

export async function pushKnowledgeSubscription(
  prisma: PrismaClient,
  sub: KnowledgeSubscriptionForPush,
  pushTime: string,
  timezone: string,
): Promise<boolean> {
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
    console.warn(`[Knowledge] No points for bank ${sub.bankId}`);
    return false;
  }

  const receiver = await resolveKnowledgeReceiver(
    prisma,
    sub.targetType as TargetType,
    sub.targetId,
  );
  const success = await pushKnowledgeToTarget({
    receiver,
    title: sub.bank.title,
    content: point.content,
    knowledgeBankId: sub.bankId,
    knowledgePointId: point.id,
  });

  if (!success) return false;

  await prisma.knowledgePushLog.create({
    data: {
      subscriptionId: sub.id,
      targetType: sub.targetType,
      targetId: sub.targetId,
      bankId: sub.bankId,
      knowledgePointId: point.id,
      contentSnapshot: point.content,
      pushDate,
      pushTime,
    },
  });

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
