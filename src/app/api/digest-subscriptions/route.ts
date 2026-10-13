import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { canManageSubscription } from "@/lib/content/access";
import {
  SUBSCRIBABLE_DIGEST_TYPES,
  isSubscribableDigestType,
} from "@/lib/digest/options";
import { buildDigestSubscriptionCounts } from "@/lib/digest/subscription-counts";
import { prisma } from "@/lib/prisma";
import { getSubscriptionReuseAction } from "@/lib/subscriptions/reuse";
import {
  DEFAULT_DIGEST_PUSH_TIMES,
  MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type DigestType,
} from "@/types";

export async function GET() {
  try {
    const countRows = await prisma.digestSubscription.groupBy({
      by: ["digestType"],
      where: { isActive: true },
      _count: { _all: true },
    });

    return NextResponse.json({
      subscriberCounts: buildDigestSubscriptionCounts(countRows),
    });
  } catch (error) {
    console.error("[GET /api/digest-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to fetch digest subscription counts" },
      { status: 500 },
    );
  }
}

function parseDigestType(value: unknown): DigestType | NextResponse {
  if (!isSubscribableDigestType(value)) {
    return NextResponse.json(
      { error: `digestType must be ${SUBSCRIBABLE_DIGEST_TYPES.join(" or ")}` },
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
    (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
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

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const digestType = parseDigestType((body as { digestType?: unknown }).digestType);
    if (digestType instanceof NextResponse) return digestType;

    const pushTimes = parsePushTimes((body as { pushTimes?: unknown }).pushTimes);
    if (pushTimes instanceof NextResponse) return pushTimes;

    const {
      targetType = "USER",
      targetId: rawTargetId,
    } = body as {
      targetType?: "USER" | "GROUP";
      targetId?: string;
    };

    let targetId: string;
    if (targetType === "USER") {
      targetId = session.user.id;
    } else if (targetType === "GROUP") {
      if (!rawTargetId || typeof rawTargetId !== "string" || rawTargetId.trim() === "") {
        return NextResponse.json(
          { error: "targetId is required for GROUP digest subscriptions" },
          { status: 400 },
        );
      }
      targetId = rawTargetId.trim();
    } else {
      return NextResponse.json(
        { error: "targetType must be USER or GROUP" },
        { status: 400 },
      );
    }

    const existing = await prisma.digestSubscription.findUnique({
      where: {
        targetType_targetId_digestType: {
          targetType,
          targetId,
          digestType,
        },
      },
    });
    if (existing) {
      if (!canManageSubscription(existing, session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const reuse = getSubscriptionReuseAction(existing);
      if (reuse.action === "conflict") {
        return NextResponse.json(
          { error: "Already subscribed to this digest" },
          { status: 409 },
        );
      }

      const currentCount = await prisma.digestSubscription.count({
        where: { targetType, targetId, isActive: true },
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
      ]);

      return NextResponse.json(subscription);
    }

    const currentCount = await prisma.digestSubscription.count({
      where: { targetType, targetId, isActive: true },
    });
    if (currentCount >= MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET) {
      return NextResponse.json(
        { error: `Digest subscription limit reached (${MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET})` },
        { status: 400 },
      );
    }

    const subscription = await prisma.digestSubscription.create({
      data: {
        targetType,
        targetId,
        digestType,
        pushTimes,
        subscriberId: session.user.id,
      },
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error("[POST /api/digest-subscriptions]", error);
    return NextResponse.json(
      { error: "Failed to create digest subscription" },
      { status: 500 },
    );
  }
}
