import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 10;

type SortMode = "latest" | "likes";

function parseSort(value: string | null): SortMode {
  return value === "likes" ? "likes" : "latest";
}

function parsePage(value: string | null): number {
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return n;
}

const commentUserSelect = {
  id: true,
  name: true,
  image: true,
  uid: true,
} as const;

const topLevelInclude = {
  user: { select: commentUserSelect },
  _count: { select: { replies: true } },
  replies: {
    take: 2,
    orderBy: { createdAt: "asc" as const },
    include: {
      user: { select: commentUserSelect },
      _count: { select: { replies: true } },
    },
  },
} satisfies Prisma.CommentInclude;

const replyListInclude = {
  user: { select: commentUserSelect },
  _count: { select: { replies: true } },
} satisfies Prisma.CommentInclude;

type TopLevelCommentRow = Prisma.CommentGetPayload<{
  include: typeof topLevelInclude;
}>;
type ReplyListCommentRow = Prisma.CommentGetPayload<{
  include: typeof replyListInclude;
}>;

function buildOrderBy(sort: SortMode): Prisma.CommentOrderByWithRelationInput[] {
  if (sort === "likes") {
    return [{ likeCount: "desc" }, { createdAt: "desc" }];
  }
  return [{ createdAt: "desc" }];
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bankId } = await context.params;

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const sort = parseSort(searchParams.get("sort"));
    const page = parsePage(searchParams.get("page"));
    const parentId = searchParams.get("parentId")?.trim() || undefined;

    if (parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, bankId },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
    }

    const where: Prisma.CommentWhereInput = parentId
      ? { bankId, parentId }
      : { bankId, parentId: null };

    const orderBy = buildOrderBy(sort);
    const skip = (page - 1) * PAGE_SIZE;

    const [total, rows] = await Promise.all([
      prisma.comment.count({ where }),
      parentId
        ? prisma.comment.findMany({
            where,
            orderBy,
            skip,
            take: PAGE_SIZE,
            include: replyListInclude,
          })
        : prisma.comment.findMany({
            where,
            orderBy,
            skip,
            take: PAGE_SIZE,
            include: topLevelInclude,
          }),
    ]);

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const ids = rows.map((c) => c.id);
    const likedIds = new Set<string>();
    if (userId && ids.length > 0) {
      const likes = await prisma.commentLike.findMany({
        where: { userId, commentId: { in: ids } },
        select: { commentId: true },
      });
      for (const l of likes) {
        likedIds.add(l.commentId);
      }
    }

    const comments = parentId
      ? (rows as ReplyListCommentRow[]).map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          likeCount: c.likeCount,
          user: c.user,
          _count: c._count,
          isLiked: likedIds.has(c.id),
        }))
      : (rows as TopLevelCommentRow[]).map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          likeCount: c.likeCount,
          user: c.user,
          _count: c._count,
          isLiked: likedIds.has(c.id),
          replies: c.replies.map((r) => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt,
            likeCount: r.likeCount,
            user: r.user,
            _count: r._count,
          })),
        }));

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return NextResponse.json({
      comments,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error("[GET /api/banks/[id]/comments]", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bankId } = await context.params;

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true },
    });
    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      content?: unknown;
      parentId?: unknown;
    };

    const rawContent = body.content;
    if (typeof rawContent !== "string" || rawContent.trim() === "") {
      return NextResponse.json(
        { error: "content must be a non-empty string" },
        { status: 400 }
      );
    }

    let parentId: string | undefined;
    if (body.parentId !== undefined && body.parentId !== null) {
      if (typeof body.parentId !== "string" || body.parentId.trim() === "") {
        return NextResponse.json(
          { error: "parentId must be a non-empty string when provided" },
          { status: 400 }
        );
      }
      parentId = body.parentId.trim();
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, bankId },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Parent comment not found for this bank" },
          { status: 400 }
        );
      }
    }

    const created = await prisma.comment.create({
      data: {
        content: rawContent.trim(),
        bankId,
        userId: session.user.id,
        ...(parentId ? { parentId } : {}),
      },
      include: {
        user: { select: commentUserSelect },
        _count: { select: { replies: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/banks/[id]/comments]", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
