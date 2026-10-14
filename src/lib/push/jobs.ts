import { createHash, randomUUID } from "node:crypto";
import { Prisma, type DeliveryJob, type PrismaClient } from "../../generated/prisma/client";
import { canSubscribeContent } from "../content/access";
import { getDigestFetchFailureCooldownMs, getDigestItemsForDate } from "../digest/delivery";
import { isDeliverableDigestType } from "../digest/options";
import { getAiNewsDigestCacheDate } from "../digest/sources";
import { runnableSubscriptionWhere, selectLearningQuestion, selectLearningKnowledge, settleQuestionSubscription, settleKnowledgeSubscription } from "../subscriptions/lifecycle";
import { isoWeekdayInTimeZone, isValidPushTime } from "../subscriptions/schedule";
import { isWorkingDay } from "../subscriptions/workdays";
import { atZonedTime, dateKey } from "../time";
import { sendToTarget, type AnyPushPayload, type PushResult } from "./adapter";
import { buildPayload } from "./payload";

type StoredPayload = { payload: AnyPushPayload; cycle?: number; generation?: number };
export const DELIVERY_WINDOW_MS = () => Math.max(1, Math.min(1440, Number(process.env.SCHEDULER_CATCH_UP_MINUTES) || 360)) * 60000;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 15 * 60000;

export function jobDedupeKey(kind: string, subscriptionId: string, day: string, time: string): string {
  return createHash("sha256").update([kind, subscriptionId, day, time].join(":")).digest("hex");
}

export function retryAt(now: Date, attempts: number, retryAfterMs = 0): Date {
  return new Date(now.getTime() + Math.max(retryAfterMs, Math.min(600000, 15000 * 2 ** Math.max(0, attempts - 1))));
}

export async function enqueueDueJobs(prisma: PrismaClient, now: Date, timezone: string): Promise<void> {
  const previous = await prisma.schedulerState.findUnique({ where: { id: "main" } });
  const earliest = new Date(Math.max(now.getTime() - DELIVERY_WINDOW_MS(), previous?.lastTickAt.getTime() ?? now.getTime() - 60000));
  const days = [...new Set([dateKey(earliest, timezone), dateKey(now, timezone)])];
  const [questions, knowledge, digests] = await Promise.all([
    prisma.subscription.findMany({ where: runnableSubscriptionWhere, include: { bank: true } }),
    prisma.knowledgeSubscription.findMany({ where: runnableSubscriptionWhere }),
    prisma.digestSubscription.findMany({ where: { isActive: true } }),
  ]);
  const rows: Prisma.DeliveryJobCreateManyInput[] = [];
  function add(kind: "QUESTION" | "KNOWLEDGE" | "DIGEST", sub: { id: string; targetType: "USER" | "GROUP"; targetId: string; createdAt: Date; startedAt?: Date; generation?: number }, times: string[], weekdays?: number[]) {
    for (const day of days) for (const pushTime of new Set(times.filter(isValidPushTime))) {
      const scheduledAt = atZonedTime(day, pushTime, timezone);
      if (weekdays && !weekdays.includes(isoWeekdayInTimeZone(scheduledAt, timezone))) continue;
      if (scheduledAt < earliest || scheduledAt > now || scheduledAt < (sub.startedAt ?? sub.createdAt) || !isWorkingDay(scheduledAt, timezone)) continue;
      rows.push({ id: randomUUID(), dedupeKey: jobDedupeKey(kind, sub.id, day, pushTime), kind, subscriptionId: sub.id, subscriptionGeneration: sub.generation ?? 0, targetType: sub.targetType, targetId: sub.targetId, scheduleDate: day, pushTime, scheduledAt, expiresAt: new Date(scheduledAt.getTime() + DELIVERY_WINDOW_MS()), nextAttemptAt: now });
    }
  }
  for (const sub of questions) {
    const weekdays = sub.bank.subscriptionScheduleMode === "FIXED" && sub.bank.subscriptionCadence === "WEEKLY" ? (sub.bank.subscriptionWeekdays.length ? sub.bank.subscriptionWeekdays : [1]) : undefined;
    add("QUESTION", sub, sub.bank.subscriptionScheduleMode === "FIXED" ? sub.bank.subscriptionPushTimes : sub.pushTimes, weekdays);
  }
  for (const sub of knowledge) add("KNOWLEDGE", sub, sub.pushTimes);
  for (const sub of digests) if (isDeliverableDigestType(sub.digestType)) add("DIGEST", sub, sub.pushTimes);
  await prisma.$transaction(async (tx) => {
    if (rows.length) await tx.deliveryJob.createMany({ data: rows, skipDuplicates: true });
    await tx.schedulerState.upsert({ where: { id: "main" }, create: { id: "main", lastTickAt: now }, update: { lastTickAt: now, lastErrorCode: null } });
  });
}

export async function claimJob(prisma: PrismaClient, now: Date, kind?: DeliveryJob["kind"]): Promise<DeliveryJob | null> {
  const token = randomUUID();
  const rows = await prisma.$queryRaw<DeliveryJob[]>`
    UPDATE "DeliveryJob" SET "status" = 'PROCESSING', "attempts" = "attempts" + 1,
      "lockedAt" = ${now}, "lockToken" = ${token}, "updatedAt" = ${now}
    WHERE "id" = (
      SELECT candidate."id" FROM "DeliveryJob" candidate
      WHERE candidate."status" = 'PENDING' AND candidate."nextAttemptAt" <= ${now}
        AND (${kind ?? null}::"DeliveryKind" IS NULL OR candidate."kind" = ${kind ?? null}::"DeliveryKind")
        AND (candidate."expiresAt" > ${now} OR candidate."receipt" IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "DeliveryJob" busy
          WHERE busy."kind" = candidate."kind" AND busy."subscriptionId" = candidate."subscriptionId"
            AND (busy."status" = 'PROCESSING' OR (busy."status" = 'PENDING'
              AND (busy."scheduledAt", busy."createdAt", busy."id") < (candidate."scheduledAt", candidate."createdAt", candidate."id"))))
      ORDER BY candidate."scheduledAt", candidate."createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *`;
  return rows[0] ?? null;
}

async function receiverFor(prisma: PrismaClient, job: DeliveryJob): Promise<string> {
  if (job.targetType === "GROUP") return job.targetId;
  const user = await prisma.user.findUnique({ where: { id: job.targetId }, select: { uid: true } });
  if (!user?.uid) throw new Error("RECIPIENT_UNAVAILABLE");
  return user.uid;
}

async function allowedFor(prisma: PrismaClient, job: DeliveryJob, bank: { creatorId: string; visibility: "PRIVATE" | "PUBLIC" | "PARTIAL"; visibleDepartments: string[] }) {
  const user = job.targetType === "USER" ? await prisma.user.findUnique({ where: { id: job.targetId }, select: { id: true, departmentIds: true } }) : null;
  return job.targetType === "GROUP" ? bank.visibility === "PUBLIC" : !!user && canSubscribeContent(bank, "USER", user.id, user.departmentIds);
}

async function preparePayload(prisma: PrismaClient, job: DeliveryJob, timezone: string): Promise<StoredPayload | null> {
  const receiver = await receiverFor(prisma, job);
  if (job.kind === "QUESTION") {
    const sub = await prisma.subscription.findUnique({ where: { id: job.subscriptionId }, include: { bank: true } });
    if (!sub?.isActive || sub.generation !== job.subscriptionGeneration || job.scheduledAt < sub.startedAt || !(await allowedFor(prisma, job, sub.bank))) return null;
    const selected = await selectLearningQuestion(prisma, sub);
    if (!selected) {
      await settleQuestionSubscription(prisma, sub.id, sub.generation);
      return null;
    }
    const { question, cycle } = selected;
    await prisma.subscription.updateMany({ where: { id: sub.id, generation: sub.generation, ...runnableSubscriptionWhere }, data: { status: "ACTIVE" } });
    return { payload: { ...buildPayload(receiver, sub.bank.title, question, { authorId: sub.bank.creatorId, businessId: question.id, domain: sub.bank.title, scene: "daily-question" }), idempotencyKey: job.dedupeKey }, cycle, generation: sub.generation };
  }
  if (job.kind === "KNOWLEDGE") {
    const sub = await prisma.knowledgeSubscription.findUnique({ where: { id: job.subscriptionId }, include: { bank: true } });
    if (!sub?.isActive || sub.generation !== job.subscriptionGeneration || job.scheduledAt < sub.startedAt || !(await allowedFor(prisma, job, sub.bank))) return null;
    if (await prisma.knowledgePushLog.findUnique({ where: { subscriptionId_pushDate_pushTime: { subscriptionId: sub.id, pushDate: job.scheduleDate, pushTime: job.pushTime } } })) return null;
    const point = await selectLearningKnowledge(prisma, sub);
    if (!point) { await settleKnowledgeSubscription(prisma, sub.id, sub.generation); return null; }
    await prisma.knowledgeSubscription.updateMany({ where: { id: sub.id, generation: sub.generation, ...runnableSubscriptionWhere }, data: { status: "ACTIVE" } });
    return { payload: { receiver, title: sub.bank.title, items: [point.content], knowledgeBankId: sub.bankId, knowledgePointId: point.id, idempotencyKey: job.dedupeKey }, generation: sub.generation };
  }
  const sub = await prisma.digestSubscription.findUnique({ where: { id: job.subscriptionId } });
  if (!sub?.isActive || !isDeliverableDigestType(sub.digestType)) return null;
  if (await prisma.digestPushLog.findUnique({ where: { targetType_targetId_digestType_digestDate_pushTime: { targetType: job.targetType, targetId: job.targetId, digestType: sub.digestType, digestDate: job.scheduleDate, pushTime: job.pushTime } } })) return null;
  const contentDate = sub.digestType === "AI_NEWS" ? getAiNewsDigestCacheDate(job.scheduledAt, timezone) : job.scheduleDate;
  const items = await getDigestItemsForDate(prisma, sub.digestType, contentDate);
  if (!items.length) throw new Error("CONTENT_TEMPORARILY_UNAVAILABLE");
  return { payload: { receiver, title: sub.digestType === "AI_NEWS" ? "AI 新闻日报" : "GitHub 热榜日报", items, digestType: sub.digestType, digestDate: contentDate, idempotencyKey: job.dedupeKey } };
}

async function stillActive(prisma: PrismaClient, job: DeliveryJob, stored: StoredPayload): Promise<boolean> {
  if (job.kind === "QUESTION") {
    const sub = await prisma.subscription.findUnique({ where: { id: job.subscriptionId }, include: { bank: true } });
    const questionId = "businessId" in stored.payload ? stored.payload.businessId : undefined;
    const question = questionId ? await prisma.question.findUnique({ where: { id: questionId }, select: { status: true, bankId: true } }) : null;
    return !!sub?.isActive && sub.generation === stored.generation && job.scheduledAt >= sub.startedAt && question?.status === "PUBLISHED" && question.bankId === sub.bankId && (sub.mode === "FOLLOW_UPDATES" || sub.editionQuestionIds.includes(questionId!)) && await allowedFor(prisma, job, sub.bank);
  }
  if (job.kind === "KNOWLEDGE") {
    const sub = await prisma.knowledgeSubscription.findUnique({ where: { id: job.subscriptionId }, include: { bank: true } });
    const pointId = "knowledgePointId" in stored.payload ? stored.payload.knowledgePointId : undefined;
    const point = pointId ? await prisma.knowledgePoint.findUnique({ where: { id: pointId }, select: { bankId: true } }) : null;
    return !!sub?.isActive && sub.generation === (stored.generation ?? 0) && job.scheduledAt >= sub.startedAt && point?.bankId === sub.bankId && (sub.mode === "FOLLOW_UPDATES" || sub.editionPointIds.includes(pointId!)) && await allowedFor(prisma, job, sub.bank);
  }
  return !!(await prisma.digestSubscription.findUnique({ where: { id: job.subscriptionId } }))?.isActive;
}

async function finishAccepted(prisma: PrismaClient, job: DeliveryJob, stored: StoredPayload, receipt: Extract<PushResult, { ok: true }>) {
  await prisma.$transaction(async (tx) => {
    const fenced = await tx.deliveryJob.updateMany({ where: { id: job.id, status: "PROCESSING", lockToken: job.lockToken }, data: { status: "ACCEPTED", receipt, externalMessageId: receipt.messageId, acceptedAt: new Date(), lastErrorCode: null, lockedAt: null, lockToken: null } });
    if (!fenced.count) return;
    const payload = stored.payload;
    if (job.kind === "QUESTION" && "businessId" in payload && payload.businessId) {
      await tx.pushLog.upsert({ where: { deliveryJobId: job.id }, create: { deliveryJobId: job.id, subscriptionId: job.subscriptionId, targetType: job.targetType, targetId: job.targetId, questionId: payload.businessId, cycle: stored.cycle, generation: stored.generation }, update: {} });
      await tx.subscription.updateMany({ where: { id: job.subscriptionId, generation: stored.generation }, data: { currentCycle: stored.cycle } });
      await settleQuestionSubscription(tx, job.subscriptionId, stored.generation ?? 0);
    } else if (job.kind === "KNOWLEDGE" && "knowledgePointId" in payload) {
      await tx.knowledgePushLog.upsert({ where: { subscriptionId_pushDate_pushTime: { subscriptionId: job.subscriptionId, pushDate: job.scheduleDate, pushTime: job.pushTime } }, create: { subscriptionId: job.subscriptionId, generation: stored.generation ?? 0, targetType: job.targetType, targetId: job.targetId, bankId: payload.knowledgeBankId, knowledgePointId: payload.knowledgePointId, contentSnapshot: payload.items[0], pushDate: job.scheduleDate, pushTime: job.pushTime }, update: {} });
      await settleKnowledgeSubscription(tx, job.subscriptionId, stored.generation ?? 0);
    } else if (job.kind === "DIGEST" && "digestType" in payload) {
      const key = { targetType: job.targetType, targetId: job.targetId, digestType: payload.digestType, digestDate: job.scheduleDate, pushTime: job.pushTime };
      await tx.digestPushLog.upsert({ where: { targetType_targetId_digestType_digestDate_pushTime: key }, create: key, update: {} });
    }
  });
}

async function processJob(prisma: PrismaClient, job: DeliveryJob, timezone: string) {
  const heartbeat = setInterval(() => { void prisma.deliveryJob.updateMany({ where: { id: job.id, status: "PROCESSING", lockToken: job.lockToken }, data: { lockedAt: new Date() } }).catch(() => {}); }, 60000);
  try {
    const stored = job.payload as StoredPayload | null ?? await preparePayload(prisma, job, timezone);
    if (!stored) {
      await prisma.deliveryJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data: { status: "CANCELLED", lastErrorCode: "SUBSCRIPTION_UNAVAILABLE", lockToken: null, lockedAt: null } });
      return;
    }
    if (job.receipt && (job.receipt as { ok?: boolean }).ok) {
      await finishAccepted(prisma, job, stored, job.receipt as Extract<PushResult, { ok: true }>);
      return;
    }
    if (!(await stillActive(prisma, job, stored))) {
      await prisma.deliveryJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data: { status: "CANCELLED", lastErrorCode: "SUBSCRIPTION_UNAVAILABLE", lockToken: null, lockedAt: null } });
      return;
    }
    await prisma.deliveryJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data: { payload: stored as unknown as Prisma.InputJsonValue } });
    const result = await sendToTarget(stored.payload);
    if (result.ok) {
      await prisma.deliveryJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data: { receipt: result, externalMessageId: result.messageId } });
      await finishAccepted(prisma, job, stored, result);
    } else await reschedule(prisma, job, result);
  } catch (error) {
    const code = error instanceof Error && ["RECIPIENT_UNAVAILABLE", "CONTENT_TEMPORARILY_UNAVAILABLE"].includes(error.message) ? error.message : "DELIVERY_PROCESSING_FAILED";
    // If acceptance was already saved, retry only the local bookkeeping.
    const saved = await prisma.deliveryJob.findUnique({ where: { id: job.id }, select: { receipt: true } });
    if (saved?.receipt && (saved.receipt as { ok?: boolean }).ok) {
      await prisma.deliveryJob.updateMany({ where: { id: job.id, lockToken: job.lockToken }, data: { status: "PENDING", lastErrorCode: "LOCAL_RECORDING_RETRY", nextAttemptAt: retryAt(new Date(), 1), lockToken: null, lockedAt: null } });
    } else await reschedule(prisma, job, { ok: false, code, retryable: true, retryAfterMs: code === "CONTENT_TEMPORARILY_UNAVAILABLE" ? getDigestFetchFailureCooldownMs() : undefined });
  } finally { clearInterval(heartbeat); }
}

async function reschedule(prisma: PrismaClient, job: DeliveryJob, failure: Extract<PushResult, { ok: false }>) {
  const next = retryAt(new Date(), job.attempts, failure.retryAfterMs);
  const canRetry = failure.retryable && !failure.uncertain && job.attempts < MAX_ATTEMPTS && next < job.expiresAt;
  await prisma.deliveryJob.updateMany({ where: { id: job.id, status: "PROCESSING", lockToken: job.lockToken }, data: { status: failure.uncertain ? "UNKNOWN" : canRetry ? "PENDING" : "FAILED", nextAttemptAt: next, lastErrorCode: failure.code, lockToken: null, lockedAt: null } });
}

export async function drainDeliveryJobs(prisma: PrismaClient, timezone: string, kind?: DeliveryJob["kind"]): Promise<void> {
  const now = new Date();
  await prisma.deliveryJob.updateMany({ where: { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }, data: { status: "PENDING", lockToken: null, lockedAt: null, nextAttemptAt: now } });
  await prisma.deliveryJob.updateMany({ where: { status: "PENDING", expiresAt: { lte: now }, receipt: { equals: Prisma.DbNull } }, data: { status: "FAILED", lastErrorCode: "DELIVERY_EXPIRED" } });
  const perTick = Math.max(1, Math.min(200, Number(process.env.SCHEDULER_BATCH_SIZE) || 50));
  for (let index = 0; index < perTick; index++) {
    const job = await claimJob(prisma, new Date(), kind);
    if (!job) break;
    await processJob(prisma, job, timezone);
  }
}
