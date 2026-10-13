import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { selectQuestion } from "@/lib/push/selector";
import { pushToTarget } from "@/lib/push/adapter";
import { buildPayload } from "@/lib/push/payload";
import { getCurrentSession, isAdminSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    if (!isAdminSession(await getCurrentSession())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const { targetType = "USER", targetId, bankId } = body as {
      targetType?: "USER" | "GROUP";
      targetId?: string;
      bankId?: string;
    };

    let subscription;
    if (targetId && bankId) {
      subscription = await prisma.subscription.findUnique({
        where: {
          targetType_targetId_bankId: { targetType, targetId, bankId },
        },
        include: { bank: true },
      });
    } else {
      subscription = await prisma.subscription.findFirst({
        where: { isActive: true },
        include: { bank: true },
      });
    }

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    const question = await selectQuestion(
      subscription.targetType as "USER" | "GROUP",
      subscription.targetId,
      subscription.bankId,
    );
    if (!question) {
      return NextResponse.json(
        { error: "No question available to push" },
        { status: 404 }
      );
    }

    let receiver = subscription.targetId;
    if (subscription.targetType === "USER") {
      const user = await prisma.user.findUnique({
        where: { id: subscription.targetId },
        select: { uid: true, name: true },
      });
      if (!user?.uid) return NextResponse.json({ error: "Recipient UID missing" }, { status: 400 });
      receiver = user.uid;
    }

    const payload = buildPayload(receiver, subscription.bank.title, question, { authorId: subscription.bank.creatorId, businessId: question.id });
    const success = await pushToTarget(payload);

    if (success) {
      await prisma.pushLog.create({
        data: {
          targetType: subscription.targetType,
          targetId: subscription.targetId,
          questionId: question.id,
          subscriptionId: subscription.id,
          cycle: subscription.currentCycle,
          generation: subscription.generation,
        },
      });
      return NextResponse.json({
        success: true,
        message: `Pushed to ${subscription.targetType}:${subscription.targetId}`,
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
