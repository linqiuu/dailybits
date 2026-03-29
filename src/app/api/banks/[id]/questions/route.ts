import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, QuestionStatus } from "@/generated/prisma/client";

type QuestionBody = {
  content: string;
  options: Prisma.InputJsonValue;
  correctAnswer: string;
  explanation: string;
};

function validateQuestionItem(
  item: unknown,
  indexLabel: string
):
  | { ok: true; data: QuestionBody }
  | { ok: false; error: string } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, error: `${indexLabel} must be an object` };
  }
  const o = item as Record<string, unknown>;
  const { content, options, correctAnswer, explanation } = o;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: `${indexLabel}: missing or invalid content` };
  }
  if (options === undefined) {
    return { ok: false, error: `${indexLabel}: options is required` };
  }
  if (typeof correctAnswer !== "string" || !correctAnswer.trim()) {
    return { ok: false, error: `${indexLabel}: missing or invalid correctAnswer` };
  }
  if (typeof explanation !== "string") {
    return { ok: false, error: `${indexLabel}: explanation must be a string` };
  }
  return {
    ok: true,
    data: {
      content: content.trim(),
      options: JSON.parse(JSON.stringify(options)) as Prisma.InputJsonValue,
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim(),
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bankId } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as QuestionStatus | null;

  const bank = await prisma.questionBank.findUnique({
    where: { id: bankId },
  });

  if (!bank) {
    return NextResponse.json({ error: "Bank not found" }, { status: 404 });
  }

  const where: { bankId: string; status?: QuestionStatus } = { bankId };
  if (status === "DRAFT" || status === "PUBLISHED") {
    where.status = status;
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ questions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: "Forbidden: must be bank creator" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (Array.isArray(raw)) {
    const validated: QuestionBody[] = [];
    for (let i = 0; i < raw.length; i++) {
      const result = validateQuestionItem(raw[i], `Item ${i}`);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      validated.push(result.data);
    }

    const questions =
      validated.length === 0
        ? []
        : await prisma.$transaction(
            validated.map((fields) =>
              prisma.question.create({
                data: {
                  bankId,
                  content: fields.content,
                  options: fields.options,
                  correctAnswer: fields.correctAnswer,
                  explanation: fields.explanation,
                  status: "DRAFT",
                  source: "MANUAL",
                },
              })
            )
          );

    return NextResponse.json({ count: questions.length, questions }, { status: 201 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("content" in raw)) {
    return NextResponse.json(
      { error: "Body must be a question object or an array of questions" },
      { status: 400 }
    );
  }

  const single = validateQuestionItem(raw, "Body");
  if (!single.ok) {
    return NextResponse.json(
      { error: "Missing or invalid: content, options, correctAnswer, explanation" },
      { status: 400 }
    );
  }

  const { content, options, correctAnswer, explanation } = single.data;
  const question = await prisma.question.create({
    data: {
      bankId,
      content,
      options,
      correctAnswer,
      explanation,
      status: "DRAFT",
      source: "MANUAL",
    },
  });

  return NextResponse.json(question, { status: 201 });
}
