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

    const userId = session.user.id;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    const [
      subscribedCount,
      todayPushed,
      todayTotal,
      createdBanksCount,
    ] = await Promise.all([
      prisma.subscription.count({
        where: { userId, isActive: true },
      }),
      prisma.pushLog.count({
        where: {
          userId,
          pushedAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      prisma.subscription
        .findMany({
          where: { userId, isActive: true },
          select: { pushTimes: true },
        })
        .then((subs) =>
          subs.reduce((sum, s) => sum + s.pushTimes.length, 0)
        ),
      prisma.questionBank.count({
        where: { creatorId: userId },
      }),
    ]);

    return NextResponse.json({
      subscribedCount,
      todayPushed,
      todayTotal,
      createdBanksCount,
    });
  } catch (error) {
    console.error("[GET /api/dashboard/stats]", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
