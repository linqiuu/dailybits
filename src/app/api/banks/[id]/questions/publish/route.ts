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

  let body: { questionIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { questionIds } = body;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json(
      { error: "questionIds must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  const validIds = questionIds.filter((id) => typeof id === "string" && id.trim());
  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "questionIds must contain at least one valid string id" },
      { status: 400 }
    );
  }

  const { count } = await prisma.question.updateMany({
    where: {
      id: { in: validIds },
      bankId,
    },
    data: { status: "PUBLISHED" },
  });

  return NextResponse.json({ updated: count });
}
