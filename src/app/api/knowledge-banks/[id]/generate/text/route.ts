import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateKnowledgeCardsFromLongText } from "@/lib/parser/document";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: bankId } = await context.params;
    const bank = await prisma.knowledgeBank.findUnique({ where: { id: bankId } });
    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    if (bank.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { text, count = 10, prompt } = body as {
      text?: string;
      count?: number;
      prompt?: string;
    };
    if (typeof text !== "string" || text.trim() === "") {
      return NextResponse.json(
        { error: "text is required and must be non-empty" },
        { status: 400 },
      );
    }
    const normalizedCount =
      Number.isInteger(count) && count > 0 ? Math.min(count, 50) : 10;
    const systemPrompt =
      typeof prompt === "string" && prompt.trim()
        ? prompt.trim()
        : bank.generationPrompt ?? undefined;

    const generated = await generateKnowledgeCardsFromLongText(
      text.trim(),
      normalizedCount,
      systemPrompt,
    );

    const max = await prisma.knowledgePoint.aggregate({
      where: { bankId },
      _max: { orderIndex: true },
    });
    const start = (max._max.orderIndex ?? 0) + 1;
    const points = await prisma.$transaction(
      generated.map((point, index) =>
        prisma.knowledgePoint.create({
          data: {
            bankId,
            content: point.content,
            orderIndex: start + index,
          },
        }),
      ),
    );

    return NextResponse.json({ points, count: points.length });
  } catch (error) {
    console.error("[POST /api/knowledge-banks/[id]/generate/text]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate knowledge points",
      },
      { status: 500 },
    );
  }
}
