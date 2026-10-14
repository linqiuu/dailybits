import "dotenv/config";
import cron from "node-cron";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type DeliveryKind } from "../generated/prisma/client.js";
import Holidays from "date-holidays";
import { drainDeliveryJobs, enqueueDueJobs } from "../lib/push/jobs.js";
import { validatePushConfiguration } from "../lib/push/adapter.js";
import { dateKey } from "../lib/time.js";
import { syncAnswerEvents } from "../lib/qa-events.js";
import { enrichAnswerIdentities } from "../lib/answers/identity.js";

const missing = validatePushConfiguration();
if (missing.length) throw new Error(`Scheduler configuration missing: ${missing.join(", ")}`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const timezone = process.env.SCHEDULER_TIMEZONE || "Asia/Shanghai";
const calendar = new Holidays(process.env.HOLIDAY_COUNTRY || "CN");
const runningKinds = new Set<DeliveryKind>();
let stopping = false;
let syncingAnswers = false;

function nonWorkingDay(date: Date): boolean {
  if (process.env.SKIP_NON_WORKING_DAYS === "false") return false;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  return weekday === "Sat" || weekday === "Sun" || !!calendar.isHoliday(date);
}

async function tick() {
  const now = new Date();
  try {
    if (nonWorkingDay(now)) {
      await prisma.schedulerState.upsert({ where: { id: "main" }, create: { id: "main", lastTickAt: now }, update: { lastTickAt: now, lastErrorCode: null } });
      return;
    }
    await enqueueDueJobs(prisma, now, timezone);
  } catch {
    console.error("[Scheduler] Enqueue failed; retained delivery tasks will retry");
    await prisma.schedulerState.updateMany({ where: { id: "main" }, data: { lastErrorCode: "ENQUEUE_FAILED" } }).catch(() => {});
  }
}

function startWorkers() {
  if (stopping || nonWorkingDay(new Date())) return;
  for (const kind of ["QUESTION", "KNOWLEDGE", "DIGEST"] as const) {
    if (runningKinds.has(kind)) continue;
    runningKinds.add(kind);
    void drainDeliveryJobs(prisma, timezone, kind)
      .catch(() => console.error(`[Scheduler] ${kind} worker failed; its task lease is recoverable`))
      .finally(() => runningKinds.delete(kind));
  }
}

const task = cron.schedule("* * * * *", tick, { timezone, noOverlap: true });
const workerTimer = setInterval(startWorkers, 5000);
function startAnswerSync() {
  if (syncingAnswers || stopping) return;
  syncingAnswers = true;
  void syncAnswerEvents(prisma)
    .catch(() => console.error("[Scheduler] Answer synchronization unavailable"))
    .then(() => enrichAnswerIdentities(prisma))
    .catch(() => console.error("[Scheduler] Answer identity enrichment unavailable"))
    .finally(() => { syncingAnswers = false; });
}
const answerTimer = setInterval(startAnswerSync, 60000);
startAnswerSync();
void tick().then(startWorkers);
console.info(`[Scheduler] Started for ${dateKey(new Date(), timezone)}, timezone=${timezone}`);

async function shutdown() {
  stopping = true;
  clearInterval(workerTimer);
  clearInterval(answerTimer);
  await task.stop();
  // Unfinished jobs retain their lease and stable key for the next process.
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
