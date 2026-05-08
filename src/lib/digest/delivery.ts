import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { DigestPushPayload, DigestType, TargetType } from "../../types";
import { fetchDigestItems, getAiNewsDigestCacheDate, getDigestItemLimit } from "./sources";

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

const DIGEST_FETCH_FAILURE_KIND = "digest-fetch-failure";
const DEFAULT_DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES = 180;

interface DigestFetchFailureCache {
  kind: typeof DIGEST_FETCH_FAILURE_KIND;
  message: string;
  failedAt: string;
  retryAfter: string;
}

export function getDigestFetchFailureCooldownMs(): number {
  const minutes = Number(
    process.env.DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES ??
      DEFAULT_DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES,
  );
  const normalized = Number.isFinite(minutes) && minutes > 0
    ? minutes
    : DEFAULT_DIGEST_FETCH_FAILURE_COOLDOWN_MINUTES;
  return normalized * 60 * 1000;
}

export function buildDigestFetchFailureCache(
  message: string,
  now = new Date(),
  cooldownMs = getDigestFetchFailureCooldownMs(),
): DigestFetchFailureCache {
  return {
    kind: DIGEST_FETCH_FAILURE_KIND,
    message,
    failedAt: now.toISOString(),
    retryAfter: new Date(now.getTime() + cooldownMs).toISOString(),
  };
}

function parseDigestFetchFailureCache(value: unknown): DigestFetchFailureCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== DIGEST_FETCH_FAILURE_KIND) return null;
  if (
    typeof record.message !== "string" ||
    typeof record.failedAt !== "string" ||
    typeof record.retryAfter !== "string"
  ) {
    return null;
  }
  return {
    kind: DIGEST_FETCH_FAILURE_KIND,
    message: record.message,
    failedAt: record.failedAt,
    retryAfter: record.retryAfter,
  };
}

export function isActiveDigestFetchFailureCache(
  value: unknown,
  now = new Date(),
): boolean {
  const failure = parseDigestFetchFailureCache(value);
  if (!failure) return false;
  const retryAfterMs = new Date(failure.retryAfter).getTime();
  return Number.isFinite(retryAfterMs) && retryAfterMs > now.getTime();
}

function parseCachedItems(items: unknown): string[] | null {
  if (!Array.isArray(items)) return null;
  const normalized = items.filter((item): item is string => typeof item === "string");
  if (normalized.length !== items.length) return null;
  return normalized.length > 0 &&
    normalized.every((item) => {
      const value = item.trim();
      return value.startsWith("### ") && value.includes("\n| ") && value.includes("\n| ---");
    })
    ? normalized
    : null;
}

export async function getDigestItemsForDate(
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
  if (isActiveDigestFetchFailureCache(cached?.items)) {
    const failure = parseDigestFetchFailureCache(cached?.items);
    console.warn(
      `[Digest] Skip ${digestType} fetch until ${failure?.retryAfter}: ${failure?.message}`,
    );
    return [];
  }

  try {
    const items = await fetchDigestItems(
      digestType,
      getDigestItemLimit(),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureCache = JSON.parse(
      JSON.stringify(buildDigestFetchFailureCache(message)),
    ) as Prisma.InputJsonValue;
    await prisma.digestCache.upsert({
      where: {
        digestType_digestDate: {
          digestType,
          digestDate,
        },
      },
      update: {
        items: failureCache,
        fetchedAt: new Date(),
      },
      create: {
        digestType,
        digestDate,
        items: failureCache,
      },
    });
    console.warn(`[Digest] Cached ${digestType} fetch failure for ${digestDate}: ${message}`);
    return [];
  }
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
