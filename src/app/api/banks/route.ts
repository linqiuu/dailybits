import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            {
              description: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {};

    const [banks, total] = await Promise.all([
      prisma.questionBank.findMany({
        where,
        include: {
          creator: {
            select: { id: true, name: true, image: true },
          },
          _count: {
            select: { questions: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.questionBank.count({ where }),
    ]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return NextResponse.json({
      banks,
      total,
      page,
      totalPages,
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
    const { title, description } = body as { title?: string; description?: string };

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "title is required and must be non-empty" },
        { status: 400 }
      );
    }

    const bank = await prisma.questionBank.create({
      data: {
        title: title.trim(),
        description:
          description != null && typeof description === "string"
            ? description.trim()
            : null,
        creatorId: session.user.id,
      },
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
    console.error("[POST /api/banks]", error);
    return NextResponse.json(
      { error: "Failed to create bank" },
      { status: 500 }
    );
  }
}
