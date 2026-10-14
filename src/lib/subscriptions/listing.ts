import type { PrismaClient } from "../../generated/prisma/client";
import { questionProgress, knowledgeProgress } from "./lifecycle";
import { questionSubscriptionInclude } from "./service";

export async function listQuestionSubscriptions(
  db: PrismaClient,
  targetType: "USER" | "GROUP",
  targetId: string,
  subscriberId?: string,
) {
  const subscriptions = await db.subscription.findMany({
    where: {
      targetType,
      targetId,
      status: { not: "CANCELLED" },
      ...(subscriberId ? { subscriberId } : {}),
    },
    include: {
      ...questionSubscriptionInclude,
      subscriber: { select: { id: true, name: true, uid: true } },
    },
    orderBy: { startedAt: "desc" },
  });
  return Promise.all(
    subscriptions.map(async (sub) => ({
      id: sub.id,
      bankId: sub.bankId,
      pushTimes: sub.pushTimes,
      effectivePushTimes:
        sub.bank.subscriptionScheduleMode === "FIXED"
          ? sub.bank.subscriptionPushTimes
          : sub.pushTimes,
      isActive: sub.isActive,
      mode: sub.mode,
      status: sub.status,
      endCondition: sub.endCondition,
      repeatCount: sub.repeatCount,
      currentCycle: sub.currentCycle,
      subscriber: sub.subscriber,
      bank: sub.bank,
      ...(await questionProgress(db, sub)),
    })),
  );
}
export async function listKnowledgeSubscriptions(
  db: PrismaClient,
  targetType: "USER" | "GROUP",
  targetId: string,
  subscriberId?: string,
) {
  const subscriptions = await db.knowledgeSubscription.findMany({
    where: {
      targetType,
      targetId,
      status: { not: "CANCELLED" },
      ...(subscriberId ? { subscriberId } : {}),
    },
    include: {
      bank: {
        select: {
          id: true,
          title: true,
          description: true,
          subscriberCount: true,
          recommendedSubscriptionMode: true,
        },
      },
      subscriber: { select: { id: true, name: true, uid: true } },
    },
    orderBy: { startedAt: "desc" },
  });
  return Promise.all(
    subscriptions.map(async (sub) => ({
      id: sub.id,
      bankId: sub.bankId,
      pushTimes: sub.pushTimes,
      isActive: sub.isActive,
      mode: sub.mode,
      status: sub.status,
      subscriber: sub.subscriber,
      bank: sub.bank,
      ...(await knowledgeProgress(db, sub)),
    })),
  );
}
