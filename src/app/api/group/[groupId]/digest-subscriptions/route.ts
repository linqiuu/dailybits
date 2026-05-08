import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionReuseAction } from "@/lib/subscriptions/reuse";
import {
  DEFAULT_DIGEST_PUSH_TIMES,
  MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type DigestType,
} from "@/types";

const DIGEST_TYPES = ["GITHUB_TRENDING", "AI_NEWS", "ARXIV_AI_PAPERS"] as const;

function parseDigestType(value: unknown): DigestType | NextResponse {
  if (typeof value !== "string" || !DIGEST_TYPES.includes(value as DigestType)) {
    return NextResponse.json(
      { error: "digestType must be GITHUB_TRENDING, AI_NEWS, or ARXIV_AI_PAPERS" },
      { status: 400 },
    );
  }
  return value as DigestType;
}

function parsePushTimes(value: unknown): string[] | NextResponse {
  const times =
    Array.isArray(value) && value.length > 0
      ? value
      : DEFAULT_DIGEST_PUSH_TIMES;
  const validTimes = times.filter(
    (time) => typeof time === "string" && /^\d{2}:\d{2}$/.test(time),
  );

  if (validTimes.length === 0) {
    return NextResponse.json(
      { error: "pushTimes must contain valid HH:MM format strings" },
      { status: 400 },
    );
  }
  if (validTimes.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION) {
    return NextResponse.json(
      { error: `pushTimes cannot exceed ${MAX_PUSH_TIMES_PER_SUBSCRIPTION}` },
      { status: 400 },
    );
  }
  if (validTimes.length !== 1) {
    return NextResponse.json(
      { error: "digest subscriptions support exactly one daily push time" },
      { status: 400 },
    );
  }
  return [...new Set(validTimes)].sort();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const subscriptions = await prisma.digestSubscription.findMany({
      where: {
        targetType: "GROUP",
        targetId: groupId,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      subscriptions,
      count: subscriptions.length,
      limit: MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET,
    });
  } catch (error) {
    console.error("[GET /api/group/[groupId]/digest-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to fetch group digest subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await context.params;
    const body = await request.json();
    const digestType = parseDigestType((body as { digestType?: unknown }).digestType);
    if (digestType instanceof NextResponse) return digestType;

    const pushTimes = parsePushTimes((body as { pushTimes?: unknown }).pushTimes);
    if (pushTimes instanceof NextResponse) return pushTimes;

    const existing = await prisma.digestSubscription.findUnique({
      where: {
        targetType_targetId_digestType: {
          targetType: "GROUP",
          targetId: groupId,
          digestType,
        },
      },
    });
    if (existing) {
      const reuse = getSubscriptionReuseAction(existing);
      if (reuse.action === "conflict") {
        return NextResponse.json(
          { error: "Already subscribed to this digest" },
          { status: 409 },
        );
      }

      const currentCount = await prisma.digestSubscription.count({
        where: { targetType: "GROUP", targetId: groupId, isActive: true },
      });
      if (currentCount >= MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET) {
        return NextResponse.json(
          { error: `Digest subscription limit reached (${MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET})` },
          { status: 400 },
        );
      }

      const [subscription] = await prisma.$transaction([
        prisma.digestSubscription.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            pushTimes,
            subscriberId: session.user.id,
          },
        }),
        prisma.digestPushLog.deleteMany({
          where: {
            targetType: "GROUP",
            targetId: groupId,
            digestType,
          },
        }),
      ]);

      return NextResponse.json(subscription);
    }

    const currentCount = await prisma.digestSubscription.count({
      where: { targetType: "GROUP", targetId: groupId, isActive: true },
    });
    if (currentCount >= MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET) {
      return NextResponse.json(
        { error: `Digest subscription limit reached (${MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET})` },
        { status: 400 },
      );
    }

    const subscription = await prisma.digestSubscription.create({
      data: {
        targetType: "GROUP",
        targetId: groupId,
        digestType,
        pushTimes,
        subscriberId: session.user.id,
      },
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error("[POST /api/group/[groupId]/digest-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to create group digest subscription" },
      { status: 500 },
    );
  }
}
