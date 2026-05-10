import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  canAccessKnowledgeBank,
  KNOWLEDGE_VISIBILITY_VALUES,
  type KnowledgeVisibility,
} from "@/lib/knowledge/access";
import { prisma } from "@/lib/prisma";

function parseVisibility(value: unknown): KnowledgeVisibility | NextResponse | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !KNOWLEDGE_VISIBILITY_VALUES.includes(value as KnowledgeVisibility)
  ) {
    return NextResponse.json(
      { error: "visibility must be PRIVATE, PUBLIC, or PARTIAL" },
      { status: 400 },
    );
  }
  return value as KnowledgeVisibility;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    const bank = await prisma.knowledgeBank.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, image: true, uid: true },
        },
        points: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        },
        _count: { select: { points: true } },
      },
    });

    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    const access = await canAccessKnowledgeBank(bank, session?.user?.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetType = (new URL(request.url).searchParams.get("targetType") ?? "USER") as
      | "USER"
      | "GROUP";
    const targetIdParam = new URL(request.url).searchParams.get("targetId");
    const resolvedTargetId =
      targetType === "GROUP" && targetIdParam
        ? targetIdParam
        : session?.user?.id ?? null;
    const subscription = resolvedTargetId
      ? await prisma.knowledgeSubscription.findUnique({
          where: {
            targetType_targetId_bankId: {
              targetType: targetType === "GROUP" && targetIdParam ? "GROUP" : "USER",
              targetId: resolvedTargetId,
              bankId: id,
            },
          },
        })
      : null;

    return NextResponse.json({
      ...bank,
      pointCount: bank._count.points,
      subscription,
    });
  } catch (error) {
    console.error("[GET /api/knowledge-banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge bank" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const bank = await prisma.knowledgeBank.findUnique({ where: { id } });
    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    if (bank.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data: {
      title?: string;
      description?: string | null;
      visibility?: KnowledgeVisibility;
      visibleDepartments?: string[];
      generationPrompt?: string | null;
    } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return NextResponse.json(
          { error: "title must be non-empty" },
          { status: 400 },
        );
      }
      data.title = body.title.trim();
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
    }
    if (body.generationPrompt !== undefined) {
      data.generationPrompt =
        typeof body.generationPrompt === "string" && body.generationPrompt.trim()
          ? body.generationPrompt.trim()
          : null;
    }

    const visibility = parseVisibility(body.visibility);
    if (visibility instanceof NextResponse) return visibility;
    if (visibility) data.visibility = visibility;

    if (body.visibleDepartments !== undefined) {
      if (!Array.isArray(body.visibleDepartments)) {
        return NextResponse.json(
          { error: "visibleDepartments must be an array of strings" },
          { status: 400 },
        );
      }
      data.visibleDepartments = body.visibleDepartments
        .filter((item: unknown): item is string => typeof item === "string")
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
    if (
      (data.visibility ?? bank.visibility) === "PARTIAL" &&
      (data.visibleDepartments ?? bank.visibleDepartments).length === 0
    ) {
      return NextResponse.json(
        { error: "visibleDepartments is required when visibility is PARTIAL" },
        { status: 400 },
      );
    }
    if ((data.visibility ?? bank.visibility) !== "PARTIAL") {
      data.visibleDepartments = [];
    }

    const updated = await prisma.knowledgeBank.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/knowledge-banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update knowledge bank" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const bank = await prisma.knowledgeBank.findUnique({ where: { id } });
    if (!bank) {
      return NextResponse.json({ error: "Knowledge bank not found" }, { status: 404 });
    }
    if (bank.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.knowledgeBank.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/knowledge-banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge bank" },
      { status: 500 },
    );
  }
}
