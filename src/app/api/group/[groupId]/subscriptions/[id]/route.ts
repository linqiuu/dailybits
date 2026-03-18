import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

type RouteContext = { params: Promise<{ groupId: string; id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { groupId, id } = await context.params;

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

    const body = await request.json();
    const { pushTimes } = body as { pushTimes?: string[] };

    if (!Array.isArray(pushTimes) || pushTimes.length === 0) {
      return NextResponse.json(
        { error: "pushTimes must be a non-empty array" },
        { status: 400 }
      );
    }

    const validTimes = pushTimes.filter(
      (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t)
    );
    if (validTimes.length === 0) {
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

    await prisma.$transaction([
      prisma.subscription.delete({ where: { id } }),
      prisma.questionBank.update({
        where: { id: subscription.bankId },
        data: { subscriberCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/group/[groupId]/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
