import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, isAdminSession } from "@/lib/auth";
import { getAiNewsDigestCacheDate } from "@/lib/digest/sources";
import {
  SUBSCRIBABLE_DIGEST_TYPES,
  isSubscribableDigestType,
} from "@/lib/digest/options";
import {
  getDigestDate,
  getDigestItemsForDate,
  pushDigestToTarget,
  resolveDigestReceiver,
} from "@/lib/digest/delivery";
import type { DigestType, TargetType } from "@/types";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    if (!isAdminSession(await getCurrentSession())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const {
      digestType = "GITHUB_TRENDING",
      targetType = "USER",
      targetId,
    } = body as {
      digestType?: DigestType;
      targetType?: TargetType;
      targetId?: string;
    };

    if (!isSubscribableDigestType(digestType)) {
      return NextResponse.json(
        { error: `digestType must be ${SUBSCRIBABLE_DIGEST_TYPES.join(" or ")}` },
        { status: 400 },
      );
    }

    const subscription = targetId
      ? await prisma.digestSubscription.findUnique({
          where: {
            targetType_targetId_digestType: { targetType, targetId, digestType },
          },
        })
      : await prisma.digestSubscription.findFirst({
          where: { digestType, isActive: true },
        });

    if (!subscription) {
      return NextResponse.json(
        { error: "Digest subscription not found" },
        { status: 404 },
      );
    }

    const timezone = process.env.SCHEDULER_TIMEZONE ?? "Asia/Shanghai";
    const now = new Date();
    const scheduleDate = getDigestDate(now, timezone);
    const digestDate = digestType === "AI_NEWS"
      ? getAiNewsDigestCacheDate(now, timezone)
      : scheduleDate;
    const items = await getDigestItemsForDate(prisma, digestType, digestDate);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "Digest content is temporarily unavailable; retry after the fetch cooldown." },
        { status: 503 },
      );
    }
    const receiver = await resolveDigestReceiver(
      prisma,
      subscription.targetType as TargetType,
      subscription.targetId,
    );
    const success = await pushDigestToTarget({
      receiver,
      title: digestType === "AI_NEWS" ? "AI News Daily" : "GitHub Trending Daily",
      items,
      digestType,
      digestDate,
    });

    if (!success) {
      return NextResponse.json({ error: "Digest push failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[POST /api/digest/trigger]", error);
    return NextResponse.json(
      { error: "Failed to trigger digest" },
      { status: 500 },
    );
  }
}
