import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

async function authorizeSubscription(subscriptionId: string, request: NextRequest) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { bank: true },
  });

  if (!subscription) {
    return { error: "Subscription not found", status: 404, subscription: null };
  }

  if (subscription.targetType === "USER") {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized", status: 401, subscription: null };
    }
    if (subscription.targetId !== session.user.id) {
      return { error: "Forbidden", status: 403, subscription: null };
    }
  } else if (subscription.targetType === "GROUP") {
    const groupId = request.headers.get("x-group-id");
    if (groupId && subscription.targetId !== groupId) {
      return { error: "Forbidden", status: 403, subscription: null };
    }
  }

  return { error: null, status: 200, subscription };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await authorizeSubscription(id, request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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
        bank: {
          select: { id: true, title: true },
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
    const auth = await authorizeSubscription(id, request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const subscription = auth.subscription!;

    await prisma.$transaction([
      prisma.subscription.delete({
        where: { id },
      }),
      prisma.questionBank.update({
        where: { id: subscription.bankId },
        data: { subscriberCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/subscriptions/[id]]", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
