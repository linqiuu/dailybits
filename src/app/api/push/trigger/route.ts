import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { selectQuestion } from "@/lib/push/selector";
import { pushToTarget } from "@/lib/push/adapter";
import { buildPayload } from "@/lib/push/payload";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { userId, bankId } = body as { userId?: string; bankId?: string };

    let subscription;
    if (userId && bankId) {
      subscription = await prisma.subscription.findUnique({
        where: { userId_bankId: { userId, bankId } },
        include: { user: true, bank: true },
      });
    } else {
      subscription = await prisma.subscription.findFirst({
        where: { isActive: true },
        include: { user: true, bank: true },
      });
    }

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const question = await selectQuestion(subscription.userId, subscription.bankId);
    if (!question) {
      return NextResponse.json(
        { error: "No question available to push" },
        { status: 404 }
      );
    }

    const receiver = subscription.user.uid ?? subscription.userId;
    const payload = buildPayload(receiver, subscription.bank.title, question);
    const success = await pushToTarget(payload);

    if (success) {
      await prisma.pushLog.create({
        data: { userId: subscription.userId, questionId: question.id },
      });
      return NextResponse.json({
        success: true,
        message: `Pushed to ${subscription.user.name || subscription.userId}`,
      });
    }

    return NextResponse.json(
      { error: "Push failed" },
      { status: 500 }
    );
  } catch (error) {
    console.error("[POST /api/push/trigger]", error);
    return NextResponse.json(
      { error: "Failed to trigger push" },
      { status: 500 }
    );
  }
}
