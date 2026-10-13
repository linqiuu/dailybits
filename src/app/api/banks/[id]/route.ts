import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, getSessionDepartmentKeys } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestionBankSchedule } from "@/lib/subscriptions/schedule";

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
  sessionUserId: string | undefined,
  userDepartments: string[],
): Promise<boolean> {
  if (bank.visibility === "PUBLIC") return true;
  if (sessionUserId && bank.creatorId === sessionUserId) return true;
  if (bank.visibility === "PRIVATE") return false;
  if (bank.visibility === "PARTIAL") {
    if (!sessionUserId) return false;
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
          where: { status: "PUBLISHED" },
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

    const session = await getCurrentSession();
    const userDepartments = await getSessionDepartmentKeys(session);
    const allowed = await canViewBank(
      {
        visibility: bank.visibility as VisibilityValue,
        visibleDepartments: bank.visibleDepartments,
        creatorId: bank.creatorId,
      },
      session?.user?.id,
      userDepartments,
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (session?.user.id === bank.creatorId) {
      bank.questions = await prisma.question.findMany({ where: { bankId: id }, orderBy: { createdAt: "asc" } });
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
            endCondition: subscription.endCondition,
            repeatCount: subscription.repeatCount,
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
    const session = await getCurrentSession();
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
    const { title, description, visibility, visibleDepartments, visibleDepartmentNames } = body as {
      title?: string;
      description?: string;
      visibility?: unknown;
      visibleDepartments?: unknown;
      visibleDepartmentNames?: unknown;
    };

    const data: {
      title?: string;
      description?: string | null;
      visibility?: VisibilityValue;
      visibleDepartments?: string[];
      visibleDepartmentNames?: string[];
      subscriptionScheduleMode?: "CUSTOM" | "FIXED";
      subscriptionCadence?: "DAILY" | "WEEKLY";
      subscriptionWeekdays?: number[];
      subscriptionPushTimes?: string[];
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
        const department = d.trim();
        if (!deps.includes(department)) {
          deps.push(department);
        }
      }
      nextVisibleDepartments = deps;
      data.visibleDepartments = deps;
      data.visibleDepartmentNames = deps;
    }

    if (visibleDepartmentNames !== undefined) {
      if (!Array.isArray(visibleDepartmentNames)) {
        return NextResponse.json(
          { error: "visibleDepartmentNames must be an array of strings" },
          { status: 400 }
        );
      }
      const names: string[] = [];
      for (const item of visibleDepartmentNames) {
        if (typeof item !== "string" || item.trim() === "") {
          return NextResponse.json(
            { error: "visibleDepartmentNames must be non-empty strings" },
            { status: 400 }
          );
        }
        names.push(item.trim());
      }
      if (names.length !== nextVisibleDepartments.length) {
        return NextResponse.json(
          { error: "visibleDepartmentNames must align with visibleDepartments" },
          { status: 400 }
        );
      }
      data.visibleDepartmentNames = names;
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
    if (effectiveVisibility !== "PARTIAL") {
      data.visibleDepartments = [];
      data.visibleDepartmentNames = [];
      nextVisibleDepartments = [];
    }

    const schedule = parseQuestionBankSchedule(body, {
      subscriptionScheduleMode: existing.subscriptionScheduleMode,
      subscriptionCadence: existing.subscriptionCadence,
      subscriptionWeekdays: existing.subscriptionWeekdays,
      subscriptionPushTimes: existing.subscriptionPushTimes,
    });
    if (!schedule.ok) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }
    Object.assign(data, schedule.value);

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
    const session = await getCurrentSession();
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
