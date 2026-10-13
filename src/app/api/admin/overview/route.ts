import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calendarRange, dateKey, DISPLAY_TIMEZONE } from "@/lib/time";
import { validatePushConfiguration } from "@/lib/push/adapter";

export const dynamic = "force-dynamic";
function pct(part: number, total: number) { return total ? Math.round(part / total * 1000) / 10 : 0; }

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const rawDays = Number(request.nextUrl.searchParams.get("days") ?? 7);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(90, Math.trunc(rawDays))) : 7;
    const now = new Date();
    const { start, end } = calendarRange(now, days);
    const [questionBankCount, knowledgeBankCount, questionCount, knowledgePointCount, subscriptions, dailyRows, bankRows, answerers, states, jobCounts, failures, caches, mostSubscribed] = await Promise.all([
      prisma.questionBank.count(), prisma.knowledgeBank.count(), prisma.question.count(), prisma.knowledgePoint.count(),
      Promise.all([
        prisma.subscription.count(), prisma.knowledgeSubscription.count(), prisma.digestSubscription.count(),
        prisma.subscription.count({ where: { isActive: true } }), prisma.knowledgeSubscription.count({ where: { isActive: true } }), prisma.digestSubscription.count({ where: { isActive: true } }),
      ]),
      prisma.$queryRaw<Array<{ date: string; answers: number; correct: number; answerers: number }>>`
        SELECT to_char("answeredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
          count(*)::int AS answers, count(*) FILTER (WHERE "isCorrect")::int AS correct,
          count(DISTINCT "respondentId")::int AS answerers
        FROM "QuestionAnswerEvent" WHERE "answeredAt" >= ${start} AND "answeredAt" < ${end}
        GROUP BY date ORDER BY date`,
      prisma.$queryRaw<Array<{ bankId: string; answers: number; correct: number; answerers: number }>>`
        SELECT "bankId", count(*)::int AS answers, count(*) FILTER (WHERE "isCorrect")::int AS correct,
          count(DISTINCT "respondentId")::int AS answerers
        FROM "QuestionAnswerEvent" WHERE "answeredAt" >= ${start} AND "answeredAt" < ${end}
        GROUP BY "bankId"`,
      prisma.questionAnswerEvent.findMany({ where: { answeredAt: { gte: start, lt: end } }, select: { respondentId: true }, distinct: ["respondentId"] }),
      prisma.schedulerState.findMany(),
      prisma.deliveryJob.groupBy({ by: ["status"], where: { scheduledAt: { gte: start, lt: end } }, _count: { _all: true } }),
      prisma.deliveryJob.findMany({ where: { status: { in: ["FAILED", "UNKNOWN", "PENDING"] }, scheduledAt: { gte: start, lt: end } }, select: { id: true, kind: true, status: true, pushTime: true, scheduleDate: true, attempts: true, lastErrorCode: true, nextAttemptAt: true }, orderBy: { scheduledAt: "desc" }, take: 10 }),
      prisma.digestCache.findMany({ orderBy: { fetchedAt: "desc" }, distinct: ["digestType"], select: { digestType: true, digestDate: true, fetchedAt: true, items: true } }),
      prisma.questionBank.findMany({ orderBy: { subscriberCount: "desc" }, take: 10, select: { id: true, title: true, subscriberCount: true, _count: { select: { questions: true } } } }),
    ]);
    const dailyMap = new Map(dailyRows.map(row => [row.date, row]));
    const daily = Array.from({ length: days }, (_, index) => {
      const date = dateKey(new Date(start.getTime() + index * 86400000));
      const row = dailyMap.get(date) ?? { answers: 0, correct: 0, answerers: 0 };
      return { date, answers: row.answers, answerers: row.answerers, correctAnswers: row.correct, accuracy: pct(row.correct, row.answers) };
    });
    const today = daily[daily.length - 1];
    const banks = await prisma.questionBank.findMany({ where: { id: { in: [...new Set([...bankRows.map(row => row.bankId), ...mostSubscribed.map(bank => bank.id)])] } }, select: { id: true, title: true, subscriberCount: true, _count: { select: { questions: true } } } });
    const usage = new Map(bankRows.map(row => [row.bankId, row]));
    const ranked = banks.map(bank => {
      const row = usage.get(bank.id) ?? { answers: 0, correct: 0, answerers: 0 };
      return { id: bank.id, title: bank.title, subscriberCount: bank.subscriberCount, questionCount: bank._count.questions, answers: row.answers, answerers: row.answerers, correctAnswers: row.correct, accuracy: pct(row.correct, row.answers) };
    });
    const scheduler = states.find(state => state.id === "main");
    const qa = states.find(state => state.id === "qa-answers");
    return NextResponse.json({
      generatedAt: now.toISOString(), timezone: DISPLAY_TIMEZONE, days,
      totals: { questionBanks: questionBankCount, knowledgeBanks: knowledgeBankCount, banks: questionBankCount + knowledgeBankCount,
        questions: questionCount, knowledgePoints: knowledgePointCount, subscriptions: subscriptions.slice(0, 3).reduce((sum, count) => sum + count, 0), activeSubscriptions: subscriptions.slice(3).reduce((sum, count) => sum + count, 0),
        periodAnswers: daily.reduce((sum, row) => sum + row.answers, 0), periodAnswerers: answerers.length,
        todayAnswers: today.answers, todayAnswerers: today.answerers, todayAccuracy: today.accuracy },
      daily, topBanks: [...ranked].sort((a, b) => b.answers - a.answers || b.subscriberCount - a.subscriberCount).slice(0, 10),
      topSubscribedBanks: [...ranked].sort((a, b) => b.subscriberCount - a.subscriberCount || b.answers - a.answers).slice(0, 10),
      operations: { schedulerLastTickAt: scheduler?.lastTickAt ?? null, schedulerHealthy: !!scheduler && now >= scheduler.lastTickAt && now.getTime() - scheduler.lastTickAt.getTime() < 180000, pushConfigured: !validatePushConfiguration().length,
        qaLastSyncAt: qa?.lastTickAt ?? null, qaSyncError: qa?.lastErrorCode ?? null, jobs: Object.fromEntries(jobCounts.map(row => [row.status, row._count._all])), failures,
        caches: caches.map(cache => ({ digestType: cache.digestType, digestDate: cache.digestDate, fetchedAt: cache.fetchedAt, available: Array.isArray(cache.items) && cache.items.length > 0 })) },
    });
  } catch {
    console.error("[Admin] Failed to fetch overview");
    return NextResponse.json({ error: "Failed to fetch admin overview" }, { status: 500 });
  }
}
