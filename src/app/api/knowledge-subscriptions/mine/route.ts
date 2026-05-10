import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetType = "USER" as const;
    const targetId = session.user.id;
    const subscriptions = await prisma.knowledgeSubscription.findMany({
      where: { targetType, targetId, isActive: true },
      include: {
        bank: {
          select: {
            id: true,
            title: true,
            _count: { select: { points: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const pushedCountBySubscription = new Map<string, number>();
    if (subscriptions.length > 0) {
      const grouped = await prisma.knowledgePushLog.groupBy({
        by: ["subscriptionId"],
        where: {
          subscriptionId: { in: subscriptions.map((sub) => sub.id) },
        },
        _count: { _all: true },
      });
      for (const item of grouped) {
        pushedCountBySubscription.set(item.subscriptionId, item._count._all);
      }
    }

    return NextResponse.json(
      subscriptions.map((sub) => ({
        id: sub.id,
        bankId: sub.bankId,
        pushTimes: sub.pushTimes,
        isActive: sub.isActive,
        bank: sub.bank,
        pointCount: sub.bank._count.points,
        pushedCount: pushedCountBySubscription.get(sub.id) ?? 0,
      })),
    );
  } catch (error) {
    console.error("[GET /api/knowledge-subscriptions/mine]", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge subscriptions" },
      { status: 500 },
    );
  }
}
