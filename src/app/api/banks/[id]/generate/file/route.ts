import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseExcelOrCsv } from "@/lib/parser/excel";
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required in multipart/form-data" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name ?? "";
    const ext = filename.toLowerCase().split(".").pop() ?? "";

    let generated: GeneratedQuestion[];
    let source: "EXCEL_IMPORT" | "AI_GENERATED";

    if (ext === "xlsx" || ext === "csv") {
      generated = parseExcelOrCsv(buffer, filename);
      source = "EXCEL_IMPORT";
    } else {
      const text = buffer.toString("utf-8");
      if (!text.trim()) {
        return NextResponse.json(
          { error: "File is empty or not a valid text file" },
          { status: 400 }
        );
      }
      generated = await generateFromLongText(text);
      source = "AI_GENERATED";
    }

    if (generated.length === 0) {
      return NextResponse.json(
        { error: "No valid questions found in file" },
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
            source,
          },
        });
      })
    );

    return NextResponse.json({
      questions,
      count: questions.length,
    });
  } catch (error) {
    console.error("[POST /api/banks/[id]/generate/file]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import file",
      },
      { status: 500 }
    );
  }
}
