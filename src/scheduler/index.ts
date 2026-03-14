import "dotenv/config";
import cron from "node-cron";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function selectQuestion(userId: string, bankId: string) {
  const unpushed = await prisma.question.findFirst({
    where: {
      bankId,
      status: "PUBLISHED",
      pushLogs: { none: { userId } },
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

async function pushToTarget(payload: any): Promise<boolean> {
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
  const currentTime = getCurrentTimeHHMM();
  console.log(`[Scheduler] Tick at ${currentTime}`);

  const matchedSubs = await prisma.subscription.findMany({
    where: {
      isActive: true,
      pushTimes: { has: currentTime },
    },
    include: { user: true },
  });

  for (const sub of matchedSubs) {
    try {
      const question = await selectQuestion(sub.userId, sub.bankId);
      if (!question) continue;

      const payload = {
        receiver: sub.userId,
        question: question.content,
        options: question.options as string[],
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      };

      const success = await pushToTarget(payload);
      if (success) {
        await prisma.pushLog.create({
          data: { userId: sub.userId, questionId: question.id },
        });
        console.log(`[Scheduler] Pushed to ${sub.user.name || sub.userId}`);
      }
    } catch (err) {
      console.error(`[Scheduler] Error for subscription ${sub.id}:`, err);
    }
  }
});

console.log("[Scheduler] Started. Checking every minute...");
