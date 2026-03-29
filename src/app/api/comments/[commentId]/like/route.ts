import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { commentId } = await context.params;
    const userId = session.user.id;

    const exists = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.commentLike.findUnique({
        where: {
          commentId_userId: { commentId, userId },
        },
      });

      if (existing) {
        await tx.commentLike.delete({
          where: { id: existing.id },
        });
        const updated = await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: updated.likeCount };
      }

      await tx.commentLike.create({
        data: { commentId, userId },
      });
      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updated.likeCount };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/comments/[commentId]/like]", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 }
    );
  }
}
