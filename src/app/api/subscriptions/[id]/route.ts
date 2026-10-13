import { NextRequest, NextResponse } from "next/server";
import { authorizeSubscriptionActor } from "@/lib/subscriptions/authorization";
import { prisma } from "@/lib/prisma";
import {
  getPushTimeLimitMessage,
  isPushTimeCountAllowedForUpdate,
} from "@/lib/subscriptions/push-times";

const END_CONDITIONS = ["END_AFTER_COMPLETE", "REPEAT_N_TIMES"] as const;
type EndConditionValue = (typeof END_CONDITIONS)[number];

async function authorizeSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { bank: true },
  });

  if (!subscription) {
    return { error: "Subscription not found", status: 404, subscription: null };
  }

  const denied = await authorizeSubscriptionActor(subscription);
  if (denied) return { ...denied, subscription: null };

  return { error: null, status: 200, subscription };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeSubscription(id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const sub = auth.subscription!;
    const body = await request.json();
    const { pushTimes, endCondition, repeatCount } = body as {
      pushTimes?: string[];
      endCondition?: unknown;
      repeatCount?: unknown;
    };

    const data: {
      pushTimes?: string[];
      endCondition?: EndConditionValue;
      repeatCount?: number;
    } = {};

    const hasPush = pushTimes !== undefined;
    const hasEnd =
      endCondition !== undefined || repeatCount !== undefined;

    if (!hasPush && !hasEnd) {
      return NextResponse.json(
        {
          error:
            "Provide pushTimes and/or endCondition and/or repeatCount to update",
        },
        { status: 400 }
      );
    }

    if (hasPush) {
      if (sub.bank.subscriptionScheduleMode === "FIXED") {
        return NextResponse.json(
          { error: "This bank uses a fixed schedule set by the creator" },
          { status: 400 }
        );
      }
      if (!Array.isArray(pushTimes) || pushTimes.length === 0) {
        return NextResponse.json(
          { error: "pushTimes must be a non-empty array" },
          { status: 400 }
        );
      }

      const validTimes = pushTimes.filter(
        (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
      );
      if (validTimes.length === 0) {
        return NextResponse.json(
          { error: "pushTimes must contain valid HH:MM format strings" },
          { status: 400 }
        );
      }

      if (!isPushTimeCountAllowedForUpdate(validTimes, sub.pushTimes)) {
        return NextResponse.json(
          { error: getPushTimeLimitMessage() },
          { status: 400 }
        );
      }
      data.pushTimes = validTimes;
    }

    let nextEndCondition = sub.endCondition as EndConditionValue;
    let nextRepeatCount = sub.repeatCount;

    if (endCondition !== undefined) {
      if (
        typeof endCondition !== "string" ||
        !END_CONDITIONS.includes(endCondition as EndConditionValue)
      ) {
        return NextResponse.json(
          { error: "endCondition must be END_AFTER_COMPLETE or REPEAT_N_TIMES" },
          { status: 400 }
        );
      }
      nextEndCondition = endCondition as EndConditionValue;
      data.endCondition = nextEndCondition;
    }

    if (repeatCount !== undefined) {
      if (
        typeof repeatCount !== "number" ||
        !Number.isInteger(repeatCount) ||
        repeatCount < 0
      ) {
        return NextResponse.json(
          { error: "repeatCount must be a non-negative integer" },
          { status: 400 }
        );
      }
      nextRepeatCount = repeatCount;
      data.repeatCount = nextRepeatCount;
    }

    if (nextEndCondition === "REPEAT_N_TIMES" && nextRepeatCount <= 0) {
      return NextResponse.json(
        { error: "repeatCount must be greater than 0 when endCondition is REPEAT_N_TIMES" },
        { status: 400 }
      );
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data,
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
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeSubscription(id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await prisma.subscription.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
