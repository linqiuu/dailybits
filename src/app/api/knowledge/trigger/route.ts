import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushKnowledgeSubscription } from "@/lib/knowledge/delivery";

function getCurrentTimeHHMM(timezone: string): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    hour12: false,
  });
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      targetType = "USER",
      targetId,
      bankId,
    } = body as {
      targetType?: "USER" | "GROUP";
      targetId?: string;
      bankId?: string;
    };

    const subscription =
      targetId && bankId
        ? await prisma.knowledgeSubscription.findUnique({
            where: {
              targetType_targetId_bankId: { targetType, targetId, bankId },
            },
            include: { bank: { select: { id: true, title: true } } },
          })
        : await prisma.knowledgeSubscription.findFirst({
            where: { isActive: true },
            include: { bank: { select: { id: true, title: true } } },
          });

    if (!subscription) {
      return NextResponse.json(
        { error: "Knowledge subscription not found" },
        { status: 404 },
      );
    }

    const timezone = process.env.SCHEDULER_TIMEZONE ?? "Asia/Shanghai";
    const pushed = await pushKnowledgeSubscription(
      prisma,
      subscription,
      `manual-${getCurrentTimeHHMM(timezone)}`,
      timezone,
    );
    if (!pushed) {
      return NextResponse.json(
        { error: "No knowledge point available to push" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/knowledge/trigger]", error);
    return NextResponse.json(
      { error: "Failed to trigger knowledge push" },
      { status: 500 },
    );
  }
}
