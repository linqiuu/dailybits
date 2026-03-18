import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
          select: { id: true, name: true, image: true },
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

    let subscription = null;
    const session = await getServerSession(authOptions);
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
    const { title, description } = body as {
      title?: string;
      description?: string;
    };

    const data: { title?: string; description?: string | null } = {};
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

    const bank = await prisma.questionBank.update({
      where: { id },
      data,
      include: {
        creator: {
          select: { id: true, name: true, image: true },
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
