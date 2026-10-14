import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, getSessionDepartmentKeys } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseQuestionBankSchedule } from "@/lib/subscriptions/schedule";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 12;

const VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;
type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

function parseVisibilityBody(body: {
  visibility?: unknown;
  visibleDepartments?: unknown;
  visibleDepartmentNames?: unknown;
}):
  | {
      visibility: VisibilityValue;
      visibleDepartments: string[];
      visibleDepartmentNames: string[];
    }
  | Response {
  let visibility: VisibilityValue = "PRIVATE";
  if (body.visibility !== undefined) {
    if (
      typeof body.visibility !== "string" ||
      !VISIBILITY_VALUES.includes(body.visibility as VisibilityValue)
    ) {
      return NextResponse.json(
        { error: "visibility must be PRIVATE, PUBLIC, or PARTIAL" },
        { status: 400 }
      );
    }
    visibility = body.visibility as VisibilityValue;
  }

  const visibleDepartments: string[] = [];
  if (body.visibleDepartments !== undefined) {
    if (!Array.isArray(body.visibleDepartments)) {
      return NextResponse.json(
        { error: "visibleDepartments must be an array of strings" },
        { status: 400 }
      );
    }
    for (const d of body.visibleDepartments) {
      if (typeof d !== "string" || d.trim() === "") {
        return NextResponse.json(
          { error: "visibleDepartments must be non-empty strings" },
          { status: 400 }
        );
      }
      const department = d.trim();
      if (!visibleDepartments.includes(department)) {
        visibleDepartments.push(department);
      }
    }
  }

  let visibleDepartmentNames = [...visibleDepartments];
  if (body.visibleDepartmentNames !== undefined) {
    if (!Array.isArray(body.visibleDepartmentNames)) {
      return NextResponse.json(
        { error: "visibleDepartmentNames must be an array of strings" },
        { status: 400 }
      );
    }
    const names: string[] = [];
    for (const item of body.visibleDepartmentNames) {
      if (typeof item !== "string" || item.trim() === "") {
        return NextResponse.json(
          { error: "visibleDepartmentNames must be non-empty strings" },
          { status: 400 }
        );
      }
      names.push(item.trim());
    }
    if (names.length !== visibleDepartments.length) {
      return NextResponse.json(
        { error: "visibleDepartmentNames must align with visibleDepartments" },
        { status: 400 }
      );
    }
    visibleDepartmentNames = names;
  }

  if (visibility === "PARTIAL" && visibleDepartments.length === 0) {
    return NextResponse.json(
      {
        error:
          "visibleDepartments must be a non-empty array when visibility is PARTIAL",
      },
      { status: 400 }
    );
  }

  return { visibility, visibleDepartments, visibleDepartmentNames };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const ownerIsMine = searchParams.get("owner") === "mine";

    const searchWhere: Prisma.QuestionBankWhereInput = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            {
              description: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {};

    const targetType = (searchParams.get("targetType") ?? "USER") as "USER" | "GROUP";
    const targetIdParam = searchParams.get("targetId");

    const session = await getCurrentSession();

    let visibilityWhere: Prisma.QuestionBankWhereInput;
    if (ownerIsMine) {
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized for owner=mine" },
          { status: 401 }
        );
      }
      visibilityWhere = { creatorId: session.user.id };
    } else if (!session?.user?.id) {
      visibilityWhere = { visibility: "PUBLIC" };
    } else {
      const userDepartments = await getSessionDepartmentKeys(session);

      const visibilityOr: Prisma.QuestionBankWhereInput[] = [
        { visibility: "PUBLIC" },
        { creatorId: session.user.id },
      ];
      if (userDepartments.length > 0) {
        visibilityOr.push({
          AND: [
            { visibility: "PARTIAL" },
            { visibleDepartments: { hasSome: userDepartments } },
          ],
        });
      }
      visibilityWhere = { OR: visibilityOr };
    }

    const where: Prisma.QuestionBankWhereInput = search
      ? { AND: [searchWhere, visibilityWhere] }
      : visibilityWhere;

    const [banks, total] = await Promise.all([
      prisma.questionBank.findMany({
        where,
        include: {
          creator: {
            select: { id: true, name: true, image: true, uid: true },
          },
          _count: {
            select: { questions: true },
          },
        },
        orderBy: ownerIsMine
          ? [{ updatedAt: "desc" }]
          : [{ subscriberCount: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.questionBank.count({ where }),
    ]);

    let subscribedBankIds: Set<string> = new Set();
    const resolvedTargetId =
      targetType === "GROUP" && targetIdParam
        ? targetIdParam
        : session?.user?.id ?? null;

    if (resolvedTargetId) {
      const subs = await prisma.subscription.findMany({
        where: {
          targetType:
            targetType === "GROUP" && targetIdParam ? "GROUP" : "USER",
          targetId: resolvedTargetId,
          status: { in: ["ACTIVE", "WAITING", "PAUSED"] },
        },
        select: { bankId: true },
      });
      subscribedBankIds = new Set(subs.map((s) => s.bankId));
    }

    const subscriptionCount = resolvedTargetId
      ? await prisma.subscription.count({
          where: {
            targetType:
              targetType === "GROUP" && targetIdParam ? "GROUP" : "USER",
            targetId: resolvedTargetId,
            status: { in: ["ACTIVE", "WAITING", "PAUSED"] },
          },
        })
      : 0;

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const bankIds = banks.map((bank) => bank.id);
    const [answerTotals, correctAnswerTotals, uniqueAnswerers] =
      bankIds.length > 0
        ? await Promise.all([
            prisma.questionAnswerEvent.groupBy({
              by: ["bankId"],
              where: { bankId: { in: bankIds } },
              _count: { _all: true },
            }),
            prisma.questionAnswerEvent.groupBy({
              by: ["bankId"],
              where: { bankId: { in: bankIds }, isCorrect: true },
              _count: { _all: true },
            }),
            prisma.questionAnswerEvent.findMany({
              where: { bankId: { in: bankIds } },
              select: { bankId: true, respondentId: true },
              distinct: ["bankId", "respondentId"],
            }),
          ])
        : [[], [], []] as const;
    const answerCountByBank = new Map(
      answerTotals.map((item) => [item.bankId, item._count._all]),
    );
    const correctAnswerCountByBank = new Map(
      correctAnswerTotals.map((item) => [item.bankId, item._count._all]),
    );
    const answererCountByBank = new Map<string, number>();
    for (const item of uniqueAnswerers) {
      answererCountByBank.set(
        item.bankId,
        (answererCountByBank.get(item.bankId) ?? 0) + 1,
      );
    }

    return NextResponse.json({
      banks: banks.map((b) => ({
        ...b,
        isSubscribed: subscribedBankIds.has(b.id),
        answerCount: answerCountByBank.get(b.id) ?? 0,
        correctAnswerCount: correctAnswerCountByBank.get(b.id) ?? 0,
        answererCount: answererCountByBank.get(b.id) ?? 0,
      })),
      total,
      page,
      totalPages,
      isLoggedIn: !!session?.user?.id,
      subscriptionCount,
    });
  } catch (error) {
    console.error("[GET /api/banks]", error);
    return NextResponse.json(
      { error: "Failed to fetch banks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description } = body as {
      title?: string;
      description?: string;
    };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "title is required and must be non-empty" },
        { status: 400 }
      );
    }

    const parsed = parseVisibilityBody(body);
    if (parsed instanceof Response) return parsed;
    const { visibility, visibleDepartments, visibleDepartmentNames } = parsed;

    const schedule = parseQuestionBankSchedule(body);
    if (!schedule.ok) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    const bank = await prisma.questionBank.create({
      data: {
        title: title.trim(),
        description:
          description != null && typeof description === "string"
            ? description.trim()
            : null,
        creatorId: session.user.id,
        visibility,
        visibleDepartments,
        visibleDepartmentNames,
        ...schedule.value,
      },
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
    console.error("[POST /api/banks]", error);
    return NextResponse.json(
      { error: "Failed to create bank" },
      { status: 500 }
    );
  }
}
