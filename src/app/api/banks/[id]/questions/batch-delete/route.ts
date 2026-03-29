import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const questionIds =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "questionIds" in body
      ? (body as { questionIds?: unknown }).questionIds
      : undefined;

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json(
      { error: "questionIds must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!questionIds.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json(
      { error: "questionIds must be an array of non-empty strings" },
      { status: 400 }
    );
  }

  const result = await prisma.question.deleteMany({
    where: {
      bankId,
      id: { in: questionIds },
    },
  });

  return NextResponse.json({ deleted: result.count });
}
