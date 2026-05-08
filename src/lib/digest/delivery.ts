import type { PrismaClient } from "../../generated/prisma/client";
import type { DigestPushPayload, DigestType, TargetType } from "../../types";
import { fetchDigestItems, getAiNewsDigestCacheDate } from "./sources";

export function getDigestDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function resolveDigestReceiver(
  prisma: PrismaClient,
  targetType: TargetType,
  targetId: string,
): Promise<string> {
  if (targetType === "GROUP") {
    return targetId;
  }
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { uid: true },
  });
  return user?.uid ?? targetId;
}

export async function pushDigestToTarget(payload: DigestPushPayload): Promise<boolean> {
  const url = process.env.PUSH_API_URL;
  if (!url) {
    console.log("[PUSH DIGEST MOCK]", JSON.stringify(payload, null, 2));
    return true;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.ok;
}

export function buildDigestPushLogKey(input: {
  targetType: TargetType;
  targetId: string;
  digestType: DigestType;
  digestDate: string;
  pushTime: string;
}) {
  return {
    targetType_targetId_digestType_digestDate_pushTime: input,
  };
}

function getDigestTitle(type: DigestType): string {
  if (type === "GITHUB_TRENDING") return "GitHub Trending Daily";
  if (type === "AI_NEWS") return "AI News Daily";
  if (type === "ARXIV_AI_PAPERS") return "arXiv AI Papers Daily";
  return "Daily Digest";
}

function parseCachedItems(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null;
  const normalized = items.filter((item): item is string => typeof item === "string");
  if (normalized.length !== items.length) return null;
  return normalized.every((item) => {
    const value = item.trim();
    return (
      value.startsWith("📦 ") ||
      value.startsWith("📰 ") ||
      value.startsWith("📄 ")
    );
  }) ? normalized : null;
}

async function getDigestItemsForDate(
  prisma: PrismaClient,
  digestType: DigestType,
  digestDate: string,
): Promise<string[]> {
  const cached = await prisma.digestCache.findUnique({
    where: {
      digestType_digestDate: {
        digestType,
        digestDate,
      },
    },
  });
  const cachedItems = parseCachedItems(cached?.items);
  if (cachedItems) return cachedItems;

  const items = await fetchDigestItems(
    digestType,
    Number(process.env.DIGEST_ITEM_LIMIT ?? 10),
    { digestDate },
  );
  await prisma.digestCache.upsert({
    where: {
      digestType_digestDate: {
        digestType,
        digestDate,
      },
    },
    update: {
      items,
      fetchedAt: new Date(),
    },
    create: {
      digestType,
      digestDate,
      items,
    },
  });
  return items;
}

export async function runDueDigestSubscriptions(
  prisma: PrismaClient,
  currentTime: string,
  timezone: string,
): Promise<void> {
  const now = new Date();
  const scheduleDate = getDigestDate(now, timezone);
  const subscriptions = await prisma.digestSubscription.findMany({
    where: {
      isActive: true,
      pushTimes: { has: currentTime },
    },
  });

  const itemCache = new Map<string, Promise<string[]>>();
  for (const sub of subscriptions) {
    try {
      const digestType = sub.digestType as DigestType;
      const contentDate =
        digestType === "AI_NEWS"
          ? getAiNewsDigestCacheDate(now, timezone)
          : scheduleDate;
      const alreadyPushed = await prisma.digestPushLog.findUnique({
        where: buildDigestPushLogKey({
          targetType: sub.targetType as TargetType,
          targetId: sub.targetId,
          digestType,
          digestDate: scheduleDate,
          pushTime: currentTime,
        }),
      });
      if (alreadyPushed) continue;

      const cacheKey = `${digestType}:${contentDate}`;
      if (!itemCache.has(cacheKey)) {
        itemCache.set(
          cacheKey,
          getDigestItemsForDate(prisma, digestType, contentDate),
        );
      }
      const items = await itemCache.get(cacheKey)!;
      if (items.length === 0) {
        console.warn(`[Digest] No items for ${digestType}`);
        continue;
      }

      const receiver = await resolveDigestReceiver(
        prisma,
        sub.targetType as TargetType,
        sub.targetId,
      );
      const success = await pushDigestToTarget({
        receiver,
        title: getDigestTitle(digestType),
        items,
        digestType,
        digestDate: contentDate,
      });

      if (success) {
        await prisma.digestPushLog.create({
          data: {
            targetType: sub.targetType,
            targetId: sub.targetId,
            digestType: sub.digestType,
            digestDate: scheduleDate,
            pushTime: currentTime,
          },
        });
        console.log(`[Digest] Pushed ${digestType} to ${sub.targetType}:${sub.targetId}`);
      }
    } catch (error) {
      console.error(`[Digest] Error for subscription ${sub.id}:`, error);
    }
  }
}
