import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authorizePoint(pointId: string, userId: string) {
  const point = await prisma.knowledgePoint.findUnique({
    where: { id: pointId },
    include: { bank: true },
  });
  if (!point) return { error: "Knowledge point not found", status: 404, point: null };
  if (point.bank.creatorId !== userId) {
    return { error: "Forbidden", status: 403, point: null };
  }
  return { error: null, status: 200, point };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const auth = await authorizePoint(id, session.user.id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data: { content?: string; orderIndex?: number } = {};
    if (body.content !== undefined) {
      if (typeof body.content !== "string" || body.content.trim() === "") {
        return NextResponse.json(
          { error: "content must be non-empty" },
          { status: 400 },
        );
      }
      data.content = body.content.trim();
    }
    if (body.orderIndex !== undefined) {
      if (
        typeof body.orderIndex !== "number" ||
        !Number.isInteger(body.orderIndex) ||
        body.orderIndex < 0
      ) {
        return NextResponse.json(
          { error: "orderIndex must be a non-negative integer" },
          { status: 400 },
        );
      }
      data.orderIndex = body.orderIndex;
    }
    if (!data.content && data.orderIndex === undefined) {
      return NextResponse.json(
        { error: "content or orderIndex is required" },
        { status: 400 },
      );
    }

    const point = await prisma.knowledgePoint.update({
      where: { id },
      data,
    });
    return NextResponse.json(point);
  } catch (error) {
    console.error("[PATCH /api/knowledge-points/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update knowledge point" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const auth = await authorizePoint(id, session.user.id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    await prisma.knowledgePoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/knowledge-points/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge point" },
      { status: 500 },
    );
  }
}
