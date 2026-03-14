import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { QuestionStatus } from "@/generated/prisma/client";

async function ensureBankCreator(questionId: string, userId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { bank: true },
  });
  if (!question) return { question: null, error: "Question not found" as const };
  if (question.bank.creatorId !== userId) {
    return { question, error: "Forbidden: must be bank creator" as const };
  }
  return { question, error: null };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: questionId } = await params;

  const { question, error } = await ensureBankCreator(questionId, session.user.id);
  if (error) {
    return NextResponse.json(
      { error },
      { status: error === "Question not found" ? 404 : 403 }
    );
  }

  let body: {
    content?: string;
    options?: unknown;
    correctAnswer?: string;
    explanation?: string;
    status?: QuestionStatus;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    content?: string;
    options?: object;
    correctAnswer?: string;
    explanation?: string;
    status?: QuestionStatus;
  } = {};

  if (body.content !== undefined) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json({ error: "content must be a non-empty string" }, { status: 400 });
    }
    data.content = body.content.trim();
  }
  if (body.options !== undefined) {
    data.options = JSON.parse(JSON.stringify(body.options)) as object;
  }
  if (body.correctAnswer !== undefined) {
    if (typeof body.correctAnswer !== "string" || !body.correctAnswer.trim()) {
      return NextResponse.json({ error: "correctAnswer must be a non-empty string" }, { status: 400 });
    }
    data.correctAnswer = body.correctAnswer.trim();
  }
  if (body.explanation !== undefined) {
    if (typeof body.explanation !== "string") {
      return NextResponse.json({ error: "explanation must be a string" }, { status: 400 });
    }
    data.explanation = body.explanation.trim();
  }
  if (body.status !== undefined) {
    if (body.status !== "DRAFT" && body.status !== "PUBLISHED") {
      return NextResponse.json({ error: "status must be DRAFT or PUBLISHED" }, { status: 400 });
    }
    data.status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(question, { status: 200 });
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: questionId } = await params;

  const { error } = await ensureBankCreator(questionId, session.user.id);
  if (error) {
    return NextResponse.json(
      { error },
      { status: error === "Question not found" ? 404 : 403 }
    );
  }

  await prisma.question.delete({
    where: { id: questionId },
  });

  return new NextResponse(null, { status: 204 });
}
