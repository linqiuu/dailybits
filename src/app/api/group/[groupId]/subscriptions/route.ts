import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await context.params;

    const subscriptions = await prisma.subscription.findMany({
      where: {
        targetType: "GROUP",
        targetId: groupId,
        isActive: true,
      },
      include: {
        subscriber: {
          select: { id: true, name: true, uid: true },
        },
        bank: {
          select: {
            id: true,
            title: true,
            description: true,
            subscriberCount: true,
            _count: { select: { questions: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const bankIds = subscriptions.map((s) => s.bankId);
    const pushedLogs = await prisma.pushLog.findMany({
      where: {
        targetType: "GROUP",
        targetId: groupId,
        question: { bankId: { in: bankIds } },
      },
      select: {
        questionId: true,
        question: { select: { bankId: true } },
      },
      distinct: ["questionId"],
    });

    const pushedCountByBank = new Map<string, number>();
    for (const p of pushedLogs) {
      const bid = p.question.bankId;
      pushedCountByBank.set(bid, (pushedCountByBank.get(bid) ?? 0) + 1);
    }

    const result = subscriptions.map((sub) => ({
      id: sub.id,
      bankId: sub.bankId,
      pushTimes: sub.pushTimes,
      isActive: sub.isActive,
      subscriber: sub.subscriber,
      bank: sub.bank,
      questionCount: sub.bank._count.questions,
      pushedCount: pushedCountByBank.get(sub.bankId) ?? 0,
    }));

    return NextResponse.json({
      subscriptions: result,
      count: result.length,
      limit: MAX_SUBSCRIPTIONS_PER_TARGET,
    });
  } catch (error) {
    console.error("[GET /api/group/[groupId]/subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to fetch group subscriptions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await context.params;
    const body = await request.json();
    const { bankId, pushTimes } = body as {
      bankId?: string;
      pushTimes?: string[];
    };

    const endParsed = parseSubscriptionEndFields(body);
    if (endParsed instanceof NextResponse) return endParsed;
    const { endCondition, repeatCount } = endParsed;

    if (!bankId || typeof bankId !== "string" || bankId.trim() === "") {
      return NextResponse.json(
        { error: "bankId is required" },
        { status: 400 }
      );
    }

    const times = Array.isArray(pushTimes) && pushTimes.length > 0
      ? pushTimes
      : DEFAULT_PUSH_TIMES;

    const validTimes = times.filter(
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

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId.trim() },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const existing = await prisma.subscription.findUnique({
      where: {
        targetType_targetId_bankId: {
          targetType: "GROUP",
          targetId: groupId,
          bankId: bank.id,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Already subscribed to this bank" },
        { status: 409 }
      );
    }

    const currentCount = await prisma.subscription.count({
      where: { targetType: "GROUP", targetId: groupId, isActive: true },
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
          targetType: "GROUP",
          targetId: groupId,
          bankId: bank.id,
          pushTimes: validTimes,
          endCondition,
          repeatCount,
          currentCycle: 0,
          subscriberId: session.user.id,
        },
        include: {
          bank: { select: { id: true, title: true } },
          subscriber: {
            select: { id: true, name: true, uid: true },
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
    console.error("[POST /api/group/[groupId]/subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
