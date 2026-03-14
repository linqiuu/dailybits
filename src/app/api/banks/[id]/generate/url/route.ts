import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchUrlAsMarkdown } from "@/lib/parser/jina";
import { generateFromLongText } from "@/lib/parser/document";
import type { GeneratedQuestion } from "@/types";

function toOptionsRecord(opts: string[]): Record<string, string> {
  const keys = ["A", "B", "C", "D"];
  const record: Record<string, string> = {};
  keys.forEach((k, i) => {
    record[k] = opts[i] ?? "";
  });
  return record;
}

function normalizeCorrectAnswer(s: string): string {
  const c = s?.toUpperCase().trim().slice(0, 1);
  return ["A", "B", "C", "D"].includes(c) ? c : "A";
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

    let body: { url: string; count?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { url, count = 10 } = body;
    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "url is required and must be non-empty" },
        { status: 400 }
      );
    }

    const text = await fetchUrlAsMarkdown(url.trim());
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract content from URL" },
        { status: 400 }
      );
    }

    const generated: GeneratedQuestion[] = await generateFromLongText(
      text,
      count
    );

    if (generated.length === 0) {
      return NextResponse.json(
        { error: "No questions generated from URL content" },
        { status: 400 }
      );
    }

    const questions = await prisma.$transaction(
      generated.map((q) => {
        const options = toOptionsRecord(q.options);
        const correctAnswer = normalizeCorrectAnswer(q.correctAnswer);
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
    console.error("[POST /api/banks/[id]/generate/url]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to parse URL",
      },
      { status: 500 }
    );
  }
}
