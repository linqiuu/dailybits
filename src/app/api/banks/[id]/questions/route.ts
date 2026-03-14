import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { QuestionStatus } from "@/generated/prisma/client";

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

  let body: { content: string; options: unknown; correctAnswer: string; explanation: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, options, correctAnswer, explanation } = body;
  if (
    typeof content !== "string" ||
    !content.trim() ||
    options === undefined ||
    typeof correctAnswer !== "string" ||
    !correctAnswer.trim() ||
    typeof explanation !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid: content, options, correctAnswer, explanation" },
      { status: 400 }
    );
  }

  const question = await prisma.question.create({
    data: {
      bankId,
      content: content.trim(),
      options: JSON.parse(JSON.stringify(options)),
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim(),
      status: "DRAFT",
      source: "MANUAL",
    },
  });

  return NextResponse.json(question, { status: 201 });
}
