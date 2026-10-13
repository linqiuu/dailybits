import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, getSessionDepartmentKeys, type AppSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 12;
const VISIBILITY_VALUES = ["PRIVATE", "PUBLIC", "PARTIAL"] as const;
type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

function parseVisibilityBody(body: {
  visibility?: unknown;
  visibleDepartments?: unknown;
  visibleDepartmentNames?: unknown;
}): { visibility: VisibilityValue; visibleDepartments: string[]; visibleDepartmentNames: string[] } | NextResponse {
  let visibility: VisibilityValue = "PRIVATE";
  if (body.visibility !== undefined) {
    if (
      typeof body.visibility !== "string" ||
      !VISIBILITY_VALUES.includes(body.visibility as VisibilityValue)
    ) {
      return NextResponse.json(
        { error: "visibility must be PRIVATE, PUBLIC, or PARTIAL" },
        { status: 400 },
      );
    }
    visibility = body.visibility as VisibilityValue;
  }

  const visibleDepartments: string[] = [];
  if (body.visibleDepartments !== undefined) {
    if (!Array.isArray(body.visibleDepartments)) {
      return NextResponse.json(
        { error: "visibleDepartments must be an array of strings" },
        { status: 400 },
      );
    }
    for (const value of body.visibleDepartments) {
      if (typeof value !== "string" || value.trim() === "") {
        return NextResponse.json(
          { error: "visibleDepartments must be non-empty strings" },
          { status: 400 },
        );
      }
      visibleDepartments.push(value.trim());
    }
  }

  if (visibility === "PARTIAL" && visibleDepartments.length === 0) {
    return NextResponse.json(
      { error: "visibleDepartments is required when visibility is PARTIAL" },
      { status: 400 },
    );
  }

  const names = body.visibleDepartmentNames;
  if (names !== undefined && (!Array.isArray(names) || names.length !== visibleDepartments.length || names.some((name) => typeof name !== "string" || !name.trim()))) {
    return NextResponse.json({ error: "visibleDepartmentNames must align with visibleDepartments" }, { status: 400 });
  }
  return { visibility, visibleDepartments, visibleDepartmentNames: Array.isArray(names) ? names.map((name: string) => name.trim()) : [] };
}

async function getVisibilityWhere(
  session: AppSession | null,
): Promise<Prisma.KnowledgeBankWhereInput> {
  if (!session?.user?.id) return { visibility: "PUBLIC" };

  const userDepartments = await getSessionDepartmentKeys(session);
  const visibilityOr: Prisma.KnowledgeBankWhereInput[] = [
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
  return { OR: visibilityOr };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const ownerIsMine = searchParams.get("owner") === "mine";
    const targetType = (searchParams.get("targetType") ?? "USER") as "USER" | "GROUP";
    const targetIdParam = searchParams.get("targetId");
    const session = await getCurrentSession();

    const searchWhere: Prisma.KnowledgeBankWhereInput = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    let visibilityWhere: Prisma.KnowledgeBankWhereInput;
    if (ownerIsMine) {
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized for owner=mine" },
          { status: 401 },
        );
      }
      visibilityWhere = { creatorId: session.user.id };
    } else {
      visibilityWhere = await getVisibilityWhere(session);
    }
    const where: Prisma.KnowledgeBankWhereInput = search
      ? { AND: [searchWhere, visibilityWhere] }
      : visibilityWhere;

    const [banks, total] = await Promise.all([
      prisma.knowledgeBank.findMany({
        where,
        include: {
          creator: {
            select: { id: true, name: true, image: true, uid: true },
          },
          _count: {
            select: { points: true },
          },
        },
        orderBy: ownerIsMine
          ? [{ updatedAt: "desc" }]
          : [{ subscriberCount: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.knowledgeBank.count({ where }),
    ]);

    const resolvedTargetId =
      targetType === "GROUP" && targetIdParam
        ? targetIdParam
        : session?.user?.id ?? null;
    let subscribedBankIds = new Set<string>();
    let subscriptionCount = 0;
    if (resolvedTargetId) {
      const resolvedTargetType =
        targetType === "GROUP" && targetIdParam ? "GROUP" : "USER";
      const subs = await prisma.knowledgeSubscription.findMany({
        where: {
          targetType: resolvedTargetType,
          targetId: resolvedTargetId,
          isActive: true,
        },
        select: { bankId: true },
      });
      subscribedBankIds = new Set(subs.map((sub) => sub.bankId));
      subscriptionCount = subs.length;
    }

    return NextResponse.json({
      banks: banks.map((bank) => ({
        ...bank,
        isSubscribed: subscribedBankIds.has(bank.id),
      })),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
      isLoggedIn: !!session?.user?.id,
      subscriptionCount,
    });
  } catch (error) {
    console.error("[GET /api/knowledge-banks]", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge banks" },
      { status: 500 },
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
    const { title, description, generationPrompt } = body as {
      title?: string;
      description?: string;
      generationPrompt?: string;
    };
    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "title is required and must be non-empty" },
        { status: 400 },
      );
    }

    const parsed = parseVisibilityBody(body);
    if (parsed instanceof NextResponse) return parsed;

    const bank = await prisma.knowledgeBank.create({
      data: {
        title: title.trim(),
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        creatorId: session.user.id,
        visibility: parsed.visibility,
        visibleDepartments: parsed.visibleDepartments,
        visibleDepartmentNames: parsed.visibleDepartmentNames,
        generationPrompt:
          typeof generationPrompt === "string" && generationPrompt.trim()
            ? generationPrompt.trim()
            : null,
      },
      include: {
        creator: {
          select: { id: true, name: true, image: true, uid: true },
        },
        _count: { select: { points: true } },
      },
    });

    return NextResponse.json(bank);
  } catch (error) {
    console.error("[POST /api/knowledge-banks]", error);
    return NextResponse.json(
      { error: "Failed to create knowledge bank" },
      { status: 500 },
    );
  }
}
