import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { canManageSubscription, canSubscribeContent } from "../content/access";
import { normalizePushTimes } from "./schedule";
import {
  isPushTimeCountAllowedForUpdate,
  getPushTimeLimitMessage,
} from "./push-times";
import {
  parseLearningMode,
  parseLearningPolicy,
  RESERVED_STATUSES,
  SubscriptionPolicyError,
} from "./policy";
import {
  settleQuestionSubscription,
  settleKnowledgeSubscription,
} from "./lifecycle";
import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  MAX_SUBSCRIPTIONS_PER_TARGET,
  MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET,
} from "../../types";

type Actor = { id: string; departmentIds: string[]; isAdmin?: boolean };
type Kind = "QUESTION" | "KNOWLEDGE";
export const questionSubscriptionInclude = {
  bank: {
    select: {
      id: true,
      title: true,
      description: true,
      subscriberCount: true,
      subscriptionScheduleMode: true,
      subscriptionCadence: true,
      subscriptionWeekdays: true,
      subscriptionPushTimes: true,
      recommendedSubscriptionMode: true,
    },
  },
} as const;

async function serializable<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      )
        continue;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new SubscriptionPolicyError("该内容已订阅，请刷新页面", 409);
      throw error;
    }
  }
}
export async function createLearningSubscription(
  db: PrismaClient,
  kind: Kind,
  actor: Actor,
  body: Record<string, unknown>,
) {
  const targetType = body.targetType ?? "USER";
  if (targetType !== "USER" && targetType !== "GROUP")
    throw new SubscriptionPolicyError("订阅目标无效");
  const targetId = targetType === "USER" ? actor.id : body.targetId;
  if (
    typeof targetId !== "string" ||
    !targetId.trim() ||
    targetId.length > 255 ||
    typeof body.bankId !== "string" ||
    !body.bankId.trim()
  )
    throw new SubscriptionPolicyError("题库或订阅目标无效");
  const bankId = body.bankId.trim();
  const target: {
    targetType: "USER" | "GROUP";
    targetId: string;
    bankId: string;
  } = { targetType, targetId: targetId.trim(), bankId };
  return serializable(db, async (tx) => {
    const bank =
      kind === "QUESTION"
        ? await tx.questionBank.findUnique({ where: { id: bankId } })
        : await tx.knowledgeBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new SubscriptionPolicyError("内容不存在", 404);
    if (!canSubscribeContent(bank, targetType, actor.id, actor.departmentIds))
      throw new SubscriptionPolicyError(
        "无权订阅此内容；群订阅仅支持公开内容",
        403,
      );
    const policy = parseLearningPolicy(body, {
      mode:
        body.endCondition === "REPEAT_N_TIMES"
          ? "CURRENT_EDITION"
          : bank.recommendedSubscriptionMode,
    });
    if (kind === "KNOWLEDGE" && policy.endCondition === "REPEAT_N_TIMES")
      throw new SubscriptionPolicyError("知识卡片不支持题目复习设置");
    const fixedTimes =
      "subscriptionScheduleMode" in bank &&
      bank.subscriptionScheduleMode === "FIXED"
        ? bank.subscriptionPushTimes
        : null;
    const times = normalizePushTimes(
      fixedTimes ?? body.pushTimes,
      DEFAULT_PUSH_TIMES,
    );
    if (
      !times ||
      !times.length ||
      times.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION
    )
      throw new SubscriptionPolicyError("推送时间无效或超过上限");
    const where = { targetType_targetId_bankId: target };
    const existing =
      kind === "QUESTION"
        ? await tx.subscription.findUnique({ where })
        : await tx.knowledgeSubscription.findUnique({ where });
    if (existing && !canManageSubscription(existing, actor))
      throw new SubscriptionPolicyError("无权管理此订阅", 403);
    if (
      existing &&
      RESERVED_STATUSES.includes(
        existing.status as "ACTIVE" | "WAITING" | "PAUSED",
      )
    )
      throw new SubscriptionPolicyError(
        "该内容已订阅，暂停后请使用继续推送",
        409,
      );
    const reserved = {
      targetType: target.targetType,
      targetId: target.targetId,
      status: { in: [...RESERVED_STATUSES] },
    };
    const count =
      kind === "QUESTION"
        ? await tx.subscription.count({ where: reserved })
        : await tx.knowledgeSubscription.count({ where: reserved });
    const limit =
      kind === "QUESTION"
        ? MAX_SUBSCRIPTIONS_PER_TARGET
        : MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET;
    if (count >= limit)
      throw new SubscriptionPolicyError(`订阅数量已达上限 ${limit}`);
    const ids =
      policy.mode === "CURRENT_EDITION"
        ? (kind === "QUESTION"
            ? await tx.question.findMany({
                where: { bankId, status: "PUBLISHED" },
                select: { id: true },
              })
            : await tx.knowledgePoint.findMany({
                where: { bankId },
                select: { id: true },
              })
          ).map((item) => item.id)
        : [];
    if (policy.mode === "CURRENT_EDITION" && !ids.length)
      throw new SubscriptionPolicyError(
        "暂无可推送内容，请选择持续跟进更新，或等待内容发布后再订阅",
      );
    const common = {
      ...target,
      mode: policy.mode,
      status: "ACTIVE" as const,
      isActive: true,
      completedAt: null,
      startedAt: new Date(),
      subscriberId: actor.id,
    };
    if (kind === "QUESTION") {
      const data = {
        ...common,
        pushTimes: times,
        editionQuestionIds: ids,
        endCondition: policy.endCondition,
        repeatCount: policy.repeatCount,
        currentCycle: 0,
      };
      const subscription = existing
        ? await tx.subscription.update({
            where: { id: existing.id },
            data: { ...data, generation: { increment: 1 } },
            include: questionSubscriptionInclude,
          })
        : await tx.subscription.create({
            data,
            include: questionSubscriptionInclude,
          });
      if (!existing)
        await tx.questionBank.update({
          where: { id: bankId },
          data: { subscriberCount: { increment: 1 } },
        });
      await settleQuestionSubscription(
        tx,
        subscription.id,
        subscription.generation,
      );
      return tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: questionSubscriptionInclude,
      });
    }
    const data = { ...common, pushTimes: times, editionPointIds: ids };
    const subscription = existing
      ? await tx.knowledgeSubscription.update({
          where: { id: existing.id },
          data: { ...data, generation: { increment: 1 } },
          include: { bank: { select: { id: true, title: true } } },
        })
      : await tx.knowledgeSubscription.create({
          data,
          include: { bank: { select: { id: true, title: true } } },
        });
    if (!existing)
      await tx.knowledgeBank.update({
        where: { id: bankId },
        data: { subscriberCount: { increment: 1 } },
      });
    await settleKnowledgeSubscription(
      tx,
      subscription.id,
      subscription.generation,
    );
    return tx.knowledgeSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: { bank: { select: { id: true, title: true } } },
    });
  });
}

export async function updateLearningSubscription(
  db: PrismaClient,
  kind: Kind,
  id: string,
  actor: Actor,
  body: Record<string, unknown>,
  groupId?: string,
) {
  return serializable(db, async (tx) => {
    const sub =
      kind === "QUESTION"
        ? await tx.subscription.findUnique({
            where: { id },
            include: { bank: true },
          })
        : await tx.knowledgeSubscription.findUnique({
            where: { id },
            include: { bank: true },
          });
    if (!sub) throw new SubscriptionPolicyError("订阅不存在", 404);
    if (
      (groupId !== undefined &&
        (sub.targetType !== "GROUP" || sub.targetId !== groupId)) ||
      !canManageSubscription(sub, actor)
    )
      throw new SubscriptionPolicyError("无权管理此订阅", 403);
    const common: {
      status?: "ACTIVE" | "PAUSED" | "CANCELLED";
      isActive?: boolean;
      startedAt?: Date;
      pushTimes?: string[];
    } = {};
    const review: Pick<
      Prisma.SubscriptionUpdateInput,
      "endCondition" | "repeatCount"
    > = {};
    const action = body.action;
    if (action !== undefined) {
      if (Object.keys(body).some((key) => key !== "action"))
        throw new SubscriptionPolicyError("状态操作不能与设置修改混用");
      if (action === "cancel")
        Object.assign(common, { status: "CANCELLED", isActive: false });
      else if (action === "pause" && sub.isActive)
        Object.assign(common, { status: "PAUSED", isActive: false });
      else if (action === "resume" && sub.status === "PAUSED")
        Object.assign(common, {
          status: "ACTIVE",
          isActive: true,
          startedAt: new Date(),
        });
      else
        throw new SubscriptionPolicyError(
          "当前状态不能执行此操作，请重新订阅开启新一期",
          409,
        );
    } else {
      if (sub.status === "COMPLETED" || sub.status === "CANCELLED")
        throw new SubscriptionPolicyError("该订阅已结束，请重新订阅", 409);
      const mode = parseLearningMode(body.mode, sub.mode);
      if (mode !== sub.mode)
        throw new SubscriptionPolicyError(
          "切换模式请先取消订阅，再按新模式重新订阅",
          409,
        );
      if (
        body.pushTimes === undefined &&
        body.endCondition === undefined &&
        body.repeatCount === undefined &&
        body.mode === undefined
      )
        throw new SubscriptionPolicyError("未提供需要修改的设置");
      if (body.pushTimes !== undefined) {
        if (
          "subscriptionScheduleMode" in sub.bank &&
          sub.bank.subscriptionScheduleMode === "FIXED"
        )
          throw new SubscriptionPolicyError("推送时间由创建者固定设置");
        if (!Array.isArray(body.pushTimes) || !body.pushTimes.length)
          throw new SubscriptionPolicyError("至少保留一个推送时间");
        const times = normalizePushTimes(body.pushTimes);
        if (!times || !isPushTimeCountAllowedForUpdate(times, sub.pushTimes))
          throw new SubscriptionPolicyError(getPushTimeLimitMessage());
        common.pushTimes = times;
      }
      if (kind === "QUESTION" && "endCondition" in sub) {
        const policy = parseLearningPolicy(body, sub);
        Object.assign(review, {
          endCondition: policy.endCondition,
          repeatCount: policy.repeatCount,
        });
      } else if (
        body.endCondition !== undefined ||
        body.repeatCount !== undefined
      )
        throw new SubscriptionPolicyError("知识卡片不支持题目复习设置");
    }
    if (kind === "QUESTION") {
      await tx.subscription.update({
        where: { id },
        data: { ...common, ...review },
      });
      await settleQuestionSubscription(tx, id, sub.generation);
    } else {
      await tx.knowledgeSubscription.update({ where: { id }, data: common });
      await settleKnowledgeSubscription(tx, id, sub.generation);
    }
    if (action)
      await tx.deliveryJob.updateMany({
        where: {
          kind,
          subscriptionId: id,
          status: "PENDING",
          receipt: { equals: Prisma.DbNull },
        },
        data: {
          status: "CANCELLED",
          lastErrorCode: "SUBSCRIPTION_STATE_CHANGED",
        },
      });
    return kind === "QUESTION"
      ? tx.subscription.findUniqueOrThrow({
          where: { id },
          include: questionSubscriptionInclude,
        })
      : tx.knowledgeSubscription.findUniqueOrThrow({
          where: { id },
          include: { bank: { select: { id: true, title: true } } },
        });
  });
}
