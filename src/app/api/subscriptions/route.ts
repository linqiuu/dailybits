import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bankId, pushTimes } = body as {
      bankId?: string;
      pushTimes?: string[];
    };

    if (!bankId || typeof bankId !== "string" || bankId.trim() === "") {
      return NextResponse.json(
        { error: "bankId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(pushTimes) || pushTimes.length === 0) {
      return NextResponse.json(
        { error: "pushTimes must be a non-empty array" },
        { status: 400 }
      );
    }

    const validTimes = pushTimes.filter(
      (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t)
    );
    if (validTimes.length === 0) {
      return NextResponse.json(
        { error: "pushTimes must contain valid HH:MM format strings" },
        { status: 400 }
      );
    }

    const bank = await prisma.questionBank.findUnique({
      where: { id: bankId.trim() },
    });

    if (!bank) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const existing = await prisma.subscription.findUnique({
      where: {
        userId_bankId: {
          userId: session.user.id,
          bankId: bank.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Already subscribed to this bank" },
        { status: 409 }
      );
    }

    const [subscription] = await prisma.$transaction([
      prisma.subscription.create({
        data: {
          userId: session.user.id,
          bankId: bank.id,
          pushTimes: validTimes,
        },
        include: {
          bank: {
            select: { id: true, title: true },
          },
        },
      }),
      prisma.questionBank.update({
        where: { id: bank.id },
        data: { subscriberCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(subscription);
  } catch (error) {
    console.error("[POST /api/subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
