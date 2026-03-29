import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserDepartments } from "@/lib/getUserDepartments";

const VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;
type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

function departmentsOverlap(
  userDepartments: string[],
  visibleDepartments: string[]
): boolean {
  const set = new Set(userDepartments);
  return visibleDepartments.some((d) => set.has(d));
}

async function canViewBank(
  bank: {
    visibility: VisibilityValue;
    visibleDepartments: string[];
    creatorId: string;
  },
  sessionUserId: string | undefined
): Promise<boolean> {
  if (bank.visibility === "PUBLIC") return true;
  if (sessionUserId && bank.creatorId === sessionUserId) return true;
  if (bank.visibility === "PRIVATE") return false;
  if (bank.visibility === "PARTIAL") {
    if (!sessionUserId) return false;
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { uid: true },
    });
    const userDepartments = await getUserDepartments(user?.uid);
    return departmentsOverlap(userDepartments, bank.visibleDepartments);
  }
  return false;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const bank = await prisma.questionBank.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, image: true, uid: true },
        },
        questions: {
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { questions: true },
        },
      },
    });

    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const allowed = await canViewBank(
      {
        visibility: bank.visibility as VisibilityValue,
        visibleDepartments: bank.visibleDepartments,
        creatorId: bank.creatorId,
      },
      session?.user?.id
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let subscription = null;
    if (session?.user?.id) {
      subscription = await prisma.subscription.findUnique({
        where: {
          targetType_targetId_bankId: {
            targetType: "USER",
            targetId: session.user.id,
            bankId: id,
          },
        },
      });
    }

    return NextResponse.json({
      ...bank,
      subscription: subscription
        ? {
            id: subscription.id,
            isActive: subscription.isActive,
            pushTimes: subscription.pushTimes,
          }
        : null,
    });
  } catch (error) {
    console.error("[GET /api/banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to fetch bank" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await prisma.questionBank.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    if (existing.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, visibility, visibleDepartments } = body as {
      title?: string;
      description?: string;
      visibility?: unknown;
      visibleDepartments?: unknown;
    };

    const data: {
      title?: string;
      description?: string | null;
      visibility?: VisibilityValue;
      visibleDepartments?: string[];
    } = {};
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim() === "") {
        return NextResponse.json(
          { error: "title must be non-empty when provided" },
          { status: 400 }
        );
      }
      data.title = title.trim();
    }
    if (description !== undefined) {
      data.description =
        description != null && typeof description === "string"
          ? description.trim()
          : null;
    }

    let nextVisibility = existing.visibility as VisibilityValue;
    let nextVisibleDepartments = [...existing.visibleDepartments];

    if (visibility !== undefined) {
      if (
        typeof visibility !== "string" ||
        !VISIBILITY_VALUES.includes(visibility as VisibilityValue)
      ) {
        return NextResponse.json(
          { error: "visibility must be PRIVATE, PUBLIC, or PARTIAL" },
          { status: 400 }
        );
      }
      nextVisibility = visibility as VisibilityValue;
      data.visibility = nextVisibility;
    }

    if (visibleDepartments !== undefined) {
      if (!Array.isArray(visibleDepartments)) {
        return NextResponse.json(
          { error: "visibleDepartments must be an array of strings" },
          { status: 400 }
        );
      }
      const deps: string[] = [];
      for (const d of visibleDepartments) {
        if (typeof d !== "string" || d.trim() === "") {
          return NextResponse.json(
            { error: "visibleDepartments must be non-empty strings" },
            { status: 400 }
          );
        }
        deps.push(d.trim());
      }
      nextVisibleDepartments = deps;
      data.visibleDepartments = deps;
    }

    const effectiveVisibility = data.visibility ?? nextVisibility;
    const effectiveDeps = data.visibleDepartments ?? nextVisibleDepartments;
    if (effectiveVisibility === "PARTIAL" && effectiveDeps.length === 0) {
      return NextResponse.json(
        {
          error:
            "visibleDepartments must be a non-empty array when visibility is PARTIAL",
        },
        { status: 400 }
      );
    }

    const bank = await prisma.questionBank.update({
      where: { id },
      data,
      include: {
        creator: {
          select: { id: true, name: true, image: true, uid: true },
        },
        _count: {
          select: { questions: true },
        },
      },
    });

    return NextResponse.json(bank);
  } catch (error) {
    console.error("[PATCH /api/banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to update bank" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await prisma.questionBank.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    if (existing.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.questionBank.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/banks/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete bank" },
      { status: 500 }
    );
  }
}
