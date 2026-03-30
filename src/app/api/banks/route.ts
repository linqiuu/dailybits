import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserDepartments } from "@/lib/getUserDepartments";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 12;

const VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;
type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

function parseVisibilityBody(body: {
  visibility?: unknown;
  visibleDepartments?: unknown;
}): { visibility: VisibilityValue; visibleDepartments: string[] } | Response {
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

  let visibleDepartments: string[] = [];
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
      visibleDepartments.push(d.trim());
    }
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

  return { visibility, visibleDepartments };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

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

    const { searchParams: sp } = new URL(request.url);
    const targetType = (sp.get("targetType") ?? "USER") as "USER" | "GROUP";
    const targetIdParam = sp.get("targetId");

    const session = await getServerSession(authOptions);

    let visibilityWhere: Prisma.QuestionBankWhereInput;
    if (!session?.user?.id) {
      visibilityWhere = { visibility: "PUBLIC" };
    } else {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { uid: true },
      });
      const userDepartments = await getUserDepartments(user?.uid);

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
        orderBy: { subscriberCount: "desc" },
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
          isActive: true,
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
            isActive: true,
          },
        })
      : 0;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return NextResponse.json({
      banks: banks.map((b) => ({
        ...b,
        isSubscribed: subscribedBankIds.has(b.id),
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
    const session = await getServerSession(authOptions);
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
    const { visibility, visibleDepartments } = parsed;

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
