import "dotenv/config";
import cron from "node-cron";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { TargetType } from "../generated/prisma/client.js";
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

  const count = await prisma.question.count({
    where: { bankId, status: "PUBLISHED" },
  });
  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);
  return prisma.question.findFirst({
    where: { bankId, status: "PUBLISHED" },
    skip,
  });
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
      const question = await selectQuestion(sub.targetType, sub.targetId, sub.bankId);
      if (!question) continue;

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
