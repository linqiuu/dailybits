import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessKnowledgeBank } from "@/lib/knowledge/access";
import { prisma } from "@/lib/prisma";

function normalizePointContents(body: unknown): string[] | NextResponse {
  if (typeof body === "string") {
    const content = body.trim();
    return content ? [content] : [];
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const rawItems =
    Array.isArray(record.contents)
      ? record.contents
      : Array.isArray(record.points)
        ? record.points
        : record.content !== undefined
          ? [record.content]
          : [];

  const contents = rawItems
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item?.content === "string") return item.content.trim();
      return "";
    })
    .filter(Boolean);

  if (contents.length === 0) {
    return NextResponse.json(
      { error: "content or contents is required" },
      { status: 400 },
    );
  }
  return contents;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: bankId } = await context.params;
    const bank = await prisma.knowledgeBank.findUnique({ where: { id: bankId } });
    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    const allowed = await canAccessKnowledgeBank(bank, session?.user?.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const points = await prisma.knowledgePoint.findMany({
      where: { bankId },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(points);
  } catch (error) {
    console.error("[GET /api/knowledge-banks/[id]/points]", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge points" },
      { status: 500 },
    );
  }
}

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
    const contents = normalizePointContents(body);
    if (contents instanceof NextResponse) return contents;

    const max = await prisma.knowledgePoint.aggregate({
      where: { bankId },
      _max: { orderIndex: true },
    });
    const start = (max._max.orderIndex ?? 0) + 1;

    const points = await prisma.$transaction(
      contents.map((content, index) =>
        prisma.knowledgePoint.create({
          data: {
            bankId,
            content,
            orderIndex: start + index,
          },
        }),
      ),
    );

    return NextResponse.json({ points, count: points.length });
  } catch (error) {
    console.error("[POST /api/knowledge-banks/[id]/points]", error);
    return NextResponse.json(
      { error: "Failed to create knowledge points" },
      { status: 500 },
    );
  }
}
