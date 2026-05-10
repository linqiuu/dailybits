import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessKnowledgeBank } from "@/lib/knowledge/access";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_KNOWLEDGE_PUSH_TIMES,
  MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
} from "@/types";

function normalizePushTimes(pushTimes: unknown): string[] | NextResponse {
  const raw = Array.isArray(pushTimes) && pushTimes.length > 0
    ? pushTimes
    : DEFAULT_KNOWLEDGE_PUSH_TIMES;
  const times = raw
    .filter((time): time is string => typeof time === "string")
    .map((time) => time.trim())
    .filter((time) => /^\d{2}:\d{2}$/.test(time));
  const unique = [...new Set(times)].sort();
  if (unique.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must contain valid HH:MM format strings" },
      { status: 400 },
    );
  }
  if (unique.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION) {
    return NextResponse.json(
      { error: `pushTimes cannot exceed ${MAX_PUSH_TIMES_PER_SUBSCRIPTION}` },
      { status: 400 },
    );
  }
  return unique;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetType = (searchParams.get("targetType") ?? "USER") as "USER" | "GROUP";
    const targetIdParam = searchParams.get("targetId");
    const session = await getServerSession(authOptions);

    let targetId: string | null = null;
    if (targetType === "GROUP") {
      targetId = targetIdParam;
    } else {
      targetId = session?.user?.id ?? null;
    }
    if (!targetId) {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }

    const subscriptions = await prisma.knowledgeSubscription.findMany({
      where: {
        targetType,
        targetId,
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
            _count: { select: { points: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = subscriptions.length
      ? await prisma.knowledgePushLog.groupBy({
          by: ["subscriptionId"],
          where: {
            subscriptionId: { in: subscriptions.map((sub) => sub.id) },
          },
          _count: { _all: true },
        })
      : [];
    const pushedCountBySubscription = new Map(
      grouped.map((item) => [item.subscriptionId, item._count._all]),
    );

    const result = subscriptions.map((sub) => ({
      id: sub.id,
      bankId: sub.bankId,
      pushTimes: sub.pushTimes,
      isActive: sub.isActive,
      subscriber: sub.subscriber,
      bank: sub.bank,
      pointCount: sub.bank._count.points,
      pushedCount: pushedCountBySubscription.get(sub.id) ?? 0,
    }));

    return NextResponse.json({
      subscriptions: result,
      count: result.length,
      limit: MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET,
    });
  } catch (error) {
    console.error("[GET /api/knowledge-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
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
          { status: 400 },
        );
      }
      targetId = rawTargetId.trim();
    } else {
      return NextResponse.json(
        { error: "targetType must be USER or GROUP" },
        { status: 400 },
      );
    }

    if (!bankId || typeof bankId !== "string" || bankId.trim() === "") {
      return NextResponse.json({ error: "bankId is required" }, { status: 400 });
    }
    const bank = await prisma.knowledgeBank.findUnique({
      where: { id: bankId.trim() },
    });
    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    const allowed = await canAccessKnowledgeBank(bank, session.user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const times = normalizePushTimes(pushTimes);
    if (times instanceof NextResponse) return times;

    const existing = await prisma.knowledgeSubscription.findUnique({
      where: {
        targetType_targetId_bankId: {
          targetType,
          targetId,
          bankId: bank.id,
        },
      },
    });
    if (existing?.isActive) {
      return NextResponse.json(
        { error: "Already subscribed to this knowledge bank" },
        { status: 409 },
      );
    }

    const currentCount = await prisma.knowledgeSubscription.count({
      where: { targetType, targetId, isActive: true },
    });
    if (currentCount >= MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET) {
      return NextResponse.json(
        { error: `Subscription limit reached (${MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET})` },
        { status: 400 },
      );
    }

    if (existing) {
      const [subscription] = await prisma.$transaction([
        prisma.knowledgeSubscription.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            pushTimes: times,
            subscriberId: session.user.id,
          },
          include: {
            bank: { select: { id: true, title: true } },
          },
        }),
      ]);
      return NextResponse.json(subscription);
    }

    const [subscription] = await prisma.$transaction([
      prisma.knowledgeSubscription.create({
        data: {
          targetType,
          targetId,
          bankId: bank.id,
          pushTimes: times,
          subscriberId: session.user.id,
        },
        include: {
          bank: { select: { id: true, title: true } },
        },
      }),
      prisma.knowledgeBank.update({
        where: { id: bank.id },
        data: { subscriberCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(subscription);
  } catch (error) {
    console.error("[POST /api/knowledge-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to subscribe knowledge bank" },
      { status: 500 },
    );
  }
}
