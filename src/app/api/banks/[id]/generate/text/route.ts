import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLLMProvider } from "@/lib/llm/provider";
import type { GeneratedQuestion } from "@/types";

function toOptionsRecord(opts: string[]): Record<string, string> {
  const keys = ["A", "B", "C", "D"];
  const record: Record<string, string> = {};
  keys.forEach((k, i) => {
    record[k] = opts[i] ?? "";
  });
  return record;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bankId } = await params;

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId },
    });

    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    if (bank.creatorId !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden: must be bank creator" },
        { status: 403 }
      );
    }

    let body: { text: string; count?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { text, count = 10 } = body;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required and must be non-empty" },
        { status: 400 }
      );
    }

    const provider = createLLMProvider();
    const generated: GeneratedQuestion[] = await provider.generateQuestions(
      text.trim(),
      count
    );

    const questions = await prisma.$transaction(
      generated.map((q) => {
        const options = toOptionsRecord(q.options);
        const correctAnswer =
          ["A", "B", "C", "D"].includes(q.correctAnswer.toUpperCase().slice(0, 1))
            ? q.correctAnswer.toUpperCase().slice(0, 1)
            : "A";
        return prisma.question.create({
          data: {
            bankId,
            content: q.content,
            options,
            correctAnswer,
            explanation: q.explanation,
            status: "DRAFT",
            source: "AI_GENERATED",
          },
        });
      })
    );

    return NextResponse.json({
      questions,
      count: questions.length,
    });
  } catch (error) {
    console.error("[POST /api/banks/[id]/generate/text]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate questions",
      },
      { status: 500 }
    );
  }
}
