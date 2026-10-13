import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isoWeekdayInTimeZone } from "@/lib/subscriptions/schedule";
import { isWorkingDay } from "@/lib/subscriptions/workdays";
import { calendarRange } from "@/lib/time";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const target = { targetType: "USER" as const, targetId: session.user.id };
    const now = new Date();
    const timezone = "Asia/Shanghai";
    const { start, end } = calendarRange(now, 1, timezone);
    const todayWeekday = isoWeekdayInTimeZone(now, timezone);
    const [questions, knowledge, digests, questionPushes, knowledgePushes, digestPushes, createdQuestionBanksCount, createdKnowledgeBanksCount] = await Promise.all([
      prisma.subscription.findMany({ where: { ...target, isActive: true }, include: { bank: true } }),
      prisma.knowledgeSubscription.findMany({ where: { ...target, isActive: true } }),
      prisma.digestSubscription.findMany({ where: { ...target, isActive: true, digestType: { in: ["AI_NEWS", "GITHUB_TRENDING"] } } }),
      prisma.pushLog.count({ where: { ...target, pushedAt: { gte: start, lt: end } } }),
      prisma.knowledgePushLog.count({ where: { ...target, pushedAt: { gte: start, lt: end } } }),
      prisma.digestPushLog.count({ where: { ...target, pushedAt: { gte: start, lt: end } } }),
      prisma.questionBank.count({ where: { creatorId: target.targetId } }),
      prisma.knowledgeBank.count({ where: { creatorId: target.targetId } }),
    ]);
    const dueQuestions = questions.reduce((sum, sub) => {
      if (sub.bank.subscriptionScheduleMode !== "FIXED") return sum + sub.pushTimes.length;
      const due = sub.bank.subscriptionCadence === "DAILY" || (sub.bank.subscriptionWeekdays.length ? sub.bank.subscriptionWeekdays : [1]).includes(todayWeekday);
      return sum + (due ? sub.bank.subscriptionPushTimes.length : 0);
    }, 0);
    return NextResponse.json({
      subscribedCount: questions.length + knowledge.length + digests.length,
      todayPushed: questionPushes + knowledgePushes + digestPushes,
      todayTotal: isWorkingDay(now, timezone) ? dueQuestions + [...knowledge, ...digests].reduce((sum, sub) => sum + sub.pushTimes.length, 0) : 0,
      createdQuestionBanksCount, createdKnowledgeBanksCount, createdBanksCount: createdQuestionBanksCount + createdKnowledgeBanksCount,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
