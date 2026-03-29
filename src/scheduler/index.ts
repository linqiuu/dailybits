import "dotenv/config";
import cron from "node-cron";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { TargetType, EndCondition } from "../generated/prisma/client.js";
import Holidays from "date-holidays";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const holidayCalendar = new Holidays(process.env.HOLIDAY_COUNTRY ?? "CN");
const skipNonWorkingDays = process.env.SKIP_NON_WORKING_DAYS !== "false";
const schedulerTZ = process.env.SCHEDULER_TIMEZONE ?? "Asia/Shanghai";

interface PushPayload {
  receiver: string;
  title: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  const formatted = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: schedulerTZ,
    hour12: false,
  });
  return formatted;
}

function shouldSkipPushToday(date: Date): {
  skip: boolean;
  reason?: "weekend" | "holiday";
  holidayName?: string;
} {
  if (!skipNonWorkingDays) {
    return { skip: false };
  }

  const dayStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: schedulerTZ,
  });
  if (dayStr === "Sat" || dayStr === "Sun") {
    return { skip: true, reason: "weekend" };
  }

  const holiday = holidayCalendar.isHoliday(date);
  if (holiday) {
    const holidays = Array.isArray(holiday) ? holiday : [holiday];
    return {
      skip: true,
      reason: "holiday",
      holidayName: (holidays[0] as { name?: string })?.name ?? "Unknown holiday",
    };
  }

  return { skip: false };
}

async function selectQuestion(
  targetType: TargetType,
  targetId: string,
  bankId: string,
) {
  const unpushed = await prisma.question.findFirst({
    where: {
      bankId,
      status: "PUBLISHED",
      pushLogs: { none: { targetType, targetId } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (unpushed) return unpushed;
  return null;
}

async function handleSubscriptionComplete(sub: {
  id: string;
  targetType: TargetType;
  targetId: string;
  bankId: string;
  endCondition: EndCondition;
  repeatCount: number;
  currentCycle: number;
}): Promise<boolean> {
  if (
    sub.endCondition === "REPEAT_N_TIMES" &&
    sub.currentCycle < sub.repeatCount
  ) {
    await prisma.$transaction([
      prisma.pushLog.deleteMany({
        where: {
          targetType: sub.targetType,
          targetId: sub.targetId,
          question: { bankId: sub.bankId },
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { currentCycle: { increment: 1 } },
      }),
    ]);
    console.log(
      `[Scheduler] Cycle ${sub.currentCycle + 1}/${sub.repeatCount} for ${sub.targetType}:${sub.targetId}, resetting push logs`
    );
    return true;
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { isActive: false },
  });
  console.log(
    `[Scheduler] Subscription ${sub.id} completed, deactivated`
  );
  return false;
}

async function resolveReceiver(
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

async function pushToEndpoint(payload: PushPayload): Promise<boolean> {
  const url = process.env.PUSH_API_URL;
  if (!url) {
    console.log("[PUSH MOCK]", JSON.stringify(payload, null, 2));
    return true;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.ok;
}

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const skipDecision = shouldSkipPushToday(now);
  if (skipDecision.skip) {
    if (skipDecision.reason === "holiday") {
      console.log(
        `[Scheduler] Skip push on holiday: ${skipDecision.holidayName ?? "Unknown holiday"}`
      );
    } else {
      console.log("[Scheduler] Skip push on weekend");
    }
    return;
  }

  const currentTime = getCurrentTimeHHMM();
  console.log(`[Scheduler] Tick at ${currentTime}`);

  const matchedSubs = await prisma.subscription.findMany({
    where: {
      isActive: true,
      pushTimes: { has: currentTime },
    },
    include: { bank: true },
  });

  for (const sub of matchedSubs) {
    try {
      let question = await selectQuestion(sub.targetType, sub.targetId, sub.bankId);

      if (!question) {
        const continued = await handleSubscriptionComplete(sub);
        if (continued) {
          question = await selectQuestion(sub.targetType, sub.targetId, sub.bankId);
        }
        if (!question) continue;
      }

      const receiver = await resolveReceiver(sub.targetType, sub.targetId);
      const payload = {
        receiver,
        title: sub.bank.title,
        question: question.content,
        options: question.options as string[],
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      };

      const success = await pushToEndpoint(payload);
      if (success) {
        await prisma.pushLog.create({
          data: {
            targetType: sub.targetType,
            targetId: sub.targetId,
            questionId: question.id,
          },
        });
        console.log(
          `[Scheduler] Pushed to ${sub.targetType}:${sub.targetId}`
        );
      }
    } catch (err) {
      console.error(`[Scheduler] Error for subscription ${sub.id}:`, err);
    }
  }
});

console.log("[Scheduler] Started. Checking every minute...");
