import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionReuseAction } from "@/lib/subscriptions/reuse";
import { normalizePushTimes } from "@/lib/subscriptions/schedule";
import { canManageSubscription, canSubscribeContent } from "@/lib/content/access";
import {
  MAX_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  DEFAULT_PUSH_TIMES,
} from "@/types";

const END_CONDITIONS = ["END_AFTER_COMPLETE", "REPEAT_N_TIMES"] as const;
type EndConditionValue = (typeof END_CONDITIONS)[number];

function parseSubscriptionEndFields(body: {
  endCondition?: unknown;
  repeatCount?: unknown;
}):
  | { endCondition: EndConditionValue; repeatCount: number }
  | NextResponse {
  let endCondition: EndConditionValue = "END_AFTER_COMPLETE";
  if (body.endCondition !== undefined) {
    if (
      typeof body.endCondition !== "string" ||
      !END_CONDITIONS.includes(body.endCondition as EndConditionValue)
    ) {
      return NextResponse.json(
        { error: "endCondition must be END_AFTER_COMPLETE or REPEAT_N_TIMES" },
        { status: 400 }
      );
    }
    endCondition = body.endCondition as EndConditionValue;
  }

  let repeatCount = 0;
  if (body.repeatCount !== undefined) {
    if (
      typeof body.repeatCount !== "number" ||
      !Number.isInteger(body.repeatCount) ||
      body.repeatCount < 0
    ) {
      return NextResponse.json(
        { error: "repeatCount must be a non-negative integer" },
        { status: 400 }
      );
    }
    repeatCount = body.repeatCount;
  }

  if (endCondition === "REPEAT_N_TIMES" && repeatCount <= 0) {
    return NextResponse.json(
      { error: "repeatCount must be greater than 0 when endCondition is REPEAT_N_TIMES" },
      { status: 400 }
    );
  }

  return { endCondition, repeatCount };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      bankId,
      pushTimes,
      targetType = "USER",
      targetId: rawTargetId,
    } = body as {
      bankId?: string;
      pushTimes?: string[];
      targetType?: "USER" | "GROUP";
      targetId?: string;
    };

    let targetId: string;

    if (targetType === "USER") {
      targetId = session.user.id;
    } else if (targetType === "GROUP") {
      if (!rawTargetId || typeof rawTargetId !== "string" || rawTargetId.trim() === "") {
        return NextResponse.json(
          { error: "targetId is required for GROUP subscriptions" },
          { status: 400 }
        );
      }
      targetId = rawTargetId.trim();
    } else {
      return NextResponse.json(
        { error: "targetType must be USER or GROUP" },
        { status: 400 }
      );
    }

    const endParsed = parseSubscriptionEndFields(body);
    if (endParsed instanceof NextResponse) return endParsed;
    const { endCondition, repeatCount } = endParsed;

    if (!bankId || typeof bankId !== "string" || bankId.trim() === "") {
      return NextResponse.json(
        { error: "bankId is required" },
        { status: 400 }
      );
    }

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId.trim() },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }
    if (!canSubscribeContent(bank, targetType, session.user.id, session.user.departmentIds)) {
      return NextResponse.json({ error: "无权订阅此内容；群订阅仅支持公开内容" }, { status: 403 });
    }

    const validTimes =
      bank.subscriptionScheduleMode === "FIXED"
        ? normalizePushTimes(bank.subscriptionPushTimes, DEFAULT_PUSH_TIMES)
        : normalizePushTimes(pushTimes, DEFAULT_PUSH_TIMES);
    if (!validTimes) {
      return NextResponse.json(
        { error: "pushTimes must contain valid HH:MM format strings" },
        { status: 400 }
      );
    }
    if (validTimes.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION) {
      return NextResponse.json(
        { error: `pushTimes cannot exceed ${MAX_PUSH_TIMES_PER_SUBSCRIPTION}` },
        { status: 400 }
      );
    }

    const existing = await prisma.subscription.findUnique({
      where: {
        targetType_targetId_bankId: {
          targetType,
          targetId,
          bankId: bank.id,
        },
      },
    });
    if (existing) {
      if (!canManageSubscription(existing, session.user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const reuse = getSubscriptionReuseAction(existing);
      if (reuse.action === "conflict") {
        return NextResponse.json(
          { error: "Already subscribed to this bank" },
          { status: 409 }
        );
      }

      const currentCount = await prisma.subscription.count({
        where: { targetType, targetId, isActive: true },
      });
      if (currentCount >= MAX_SUBSCRIPTIONS_PER_TARGET) {
        return NextResponse.json(
          { error: `Subscription limit reached (${MAX_SUBSCRIPTIONS_PER_TARGET})` },
          { status: 400 }
        );
      }

      const [subscription] = await prisma.$transaction([
        prisma.subscription.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            pushTimes: validTimes,
            endCondition,
            repeatCount,
            currentCycle: 0,
            generation: { increment: 1 },
            subscriberId: session.user.id,
          },
          include: {
            bank: {
              select: {
                id: true,
                title: true,
                subscriptionScheduleMode: true,
                subscriptionCadence: true,
                subscriptionWeekdays: true,
                subscriptionPushTimes: true,
              },
            },
          },
        }),
      ]);

      return NextResponse.json(subscription);
    }

    const currentCount = await prisma.subscription.count({
      where: { targetType, targetId, isActive: true },
    });
    if (currentCount >= MAX_SUBSCRIPTIONS_PER_TARGET) {
      return NextResponse.json(
        { error: `Subscription limit reached (${MAX_SUBSCRIPTIONS_PER_TARGET})` },
        { status: 400 }
      );
    }

    const [subscription] = await prisma.$transaction([
      prisma.subscription.create({
        data: {
          targetType,
          targetId,
          bankId: bank.id,
          pushTimes: validTimes,
          endCondition,
          repeatCount,
          currentCycle: 0,
          subscriberId: session.user.id,
        },
        include: {
          bank: {
            select: {
              id: true,
              title: true,
              subscriptionScheduleMode: true,
              subscriptionCadence: true,
              subscriptionWeekdays: true,
              subscriptionPushTimes: true,
            },
          },
        },
      }),
      prisma.questionBank.update({
        where: { id: bank.id },
        data: { subscriberCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(subscription);
  } catch (error) {
    console.error("[POST /api/subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
