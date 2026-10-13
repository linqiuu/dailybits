import { NextRequest, NextResponse } from "next/server";
import {
  getPushTimeLimitMessage,
  isPushTimeCountAllowedForUpdate,
} from "@/lib/subscriptions/push-times";
import { prisma } from "@/lib/prisma";
import { authorizeSubscriptionActor } from "@/lib/subscriptions/authorization";
import { isValidPushTime } from "@/lib/subscriptions/schedule";

type RouteContext = { params: Promise<{ groupId: string; id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { groupId, id } = await context.params;

    if (!/^\d+$/.test(groupId)) {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { bank: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }
    if (subscription.targetType !== "GROUP" || subscription.targetId !== groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const denied = await authorizeSubscriptionActor(subscription);
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
    if (subscription.bank.subscriptionScheduleMode === "FIXED") {
      return NextResponse.json({ error: "This bank uses a creator-fixed schedule" }, { status: 400 });
    }

    const body = await request.json();
    const { pushTimes } = body as { pushTimes?: string[] };

    if (!Array.isArray(pushTimes) || pushTimes.length === 0) {
      return NextResponse.json(
        { error: "pushTimes must be a non-empty array" },
        { status: 400 }
      );
    }

    const validTimes = pushTimes.filter(
      (t) => typeof t === "string" && isValidPushTime(t)
    );
    if (validTimes.length !== pushTimes.length) {
      return NextResponse.json(
        { error: "pushTimes must contain valid HH:MM format strings" },
        { status: 400 }
      );
    }
    if (!isPushTimeCountAllowedForUpdate(validTimes, subscription.pushTimes)) {
      return NextResponse.json(
        { error: getPushTimeLimitMessage() },
        { status: 400 }
      );
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: { pushTimes: validTimes },
      include: {
        bank: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/group/[groupId]/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { groupId, id } = await context.params;

    if (!/^\d+$/.test(groupId)) {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }
    if (subscription.targetType !== "GROUP" || subscription.targetId !== groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const denied = await authorizeSubscriptionActor(subscription);
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    await prisma.subscription.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/group/[groupId]/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
