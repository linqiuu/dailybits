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

    const subscriptions = await prisma.subscription.findMany({
      where: {
        targetType,
        targetId,
        isActive: true,
      },
      include: {
        bank: {
          select: {
            id: true,
            title: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });

    const bankIds = subscriptions.map((s) => s.bankId);
    const pushedWithBank = await prisma.pushLog.findMany({
      where: {
        targetType,
        targetId,
        question: { bankId: { in: bankIds } },
      },
      select: {
        questionId: true,
        question: { select: { bankId: true } },
      },
      distinct: ["questionId"],
    });

    const pushedCountByBank = new Map<string, number>();
    for (const p of pushedWithBank) {
      const bid = p.question.bankId;
      pushedCountByBank.set(bid, (pushedCountByBank.get(bid) ?? 0) + 1);
    }

    const result = subscriptions.map((sub) => ({
      id: sub.id,
      bankId: sub.bankId,
      pushTimes: sub.pushTimes,
      isActive: sub.isActive,
      bank: sub.bank,
      questionCount: sub.bank._count.questions,
      pushedCount: pushedCountByBank.get(sub.bankId) ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/subscriptions/mine]", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}
