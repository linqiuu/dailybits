import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

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

    if (subscription.userId !== session.user.id) {
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

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

    if (subscription.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
