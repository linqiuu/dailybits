import { NextRequest, NextResponse } from "next/server";
import { authorizeSubscriptionActor } from "@/lib/subscriptions/authorization";
import { prisma } from "@/lib/prisma";
import {
  getPushTimeLimitMessage,
  isPushTimeCountAllowedForUpdate,
} from "@/lib/subscriptions/push-times";

function normalizePushTimes(
  pushTimes: unknown,
  existingPushTimes?: string[] | null,
): string[] | NextResponse {
  if (!Array.isArray(pushTimes) || pushTimes.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must be a non-empty array" },
      { status: 400 },
    );
  }
  const times = pushTimes
    .filter((time): time is string => typeof time === "string")
    .map((time) => time.trim())
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const unique = [...new Set(times)].sort();
  if (unique.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must contain valid HH:MM format strings" },
      { status: 400 },
    );
  }
  if (!isPushTimeCountAllowedForUpdate(unique, existingPushTimes)) {
    return NextResponse.json(
      { error: getPushTimeLimitMessage() },
      { status: 400 },
    );
  }
  return unique;
}

async function authorizeSubscription(subscriptionId: string) {
  const subscription = await prisma.knowledgeSubscription.findUnique({
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
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeSubscription(id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const times = normalizePushTimes(body.pushTimes, auth.subscription?.pushTimes);
    if (times instanceof NextResponse) return times;

    const updated = await prisma.knowledgeSubscription.update({
      where: { id },
      data: { pushTimes: times },
      include: { bank: { select: { id: true, title: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/knowledge-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update knowledge subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeSubscription(id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    await prisma.knowledgeSubscription.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/knowledge-subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe knowledge bank" },
      { status: 500 },
    );
  }
}
