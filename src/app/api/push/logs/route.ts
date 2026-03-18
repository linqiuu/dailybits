import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const [logs, total] = await Promise.all([
      prisma.pushLog.findMany({
        where: { targetType: "USER", targetId: session.user.id },
        orderBy: { pushedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          pushedAt: true,
          question: {
            select: {
              content: true,
              correctAnswer: true,
              bank: { select: { title: true } },
            },
          },
        },
      }),
      prisma.pushLog.count({
        where: { targetType: "USER", targetId: session.user.id },
      }),
    ]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const formattedLogs = logs.map((log) => ({
      pushedAt: log.pushedAt,
      bankName: log.question.bank.title,
      questionExcerpt: truncate(log.question.content, 80),
      correctAnswer: log.question.correctAnswer,
    }));

    return NextResponse.json({
      logs: formattedLogs,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error("[GET /api/push/logs]", error);
    return NextResponse.json(
      { error: "Failed to fetch push logs" },
      { status: 500 }
    );
  }
}
