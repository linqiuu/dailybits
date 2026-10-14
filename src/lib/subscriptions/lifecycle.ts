import type {
  Prisma,
  PrismaClient,
  Subscription,
  KnowledgeSubscription,
} from "../../generated/prisma/client";
import { RUNNABLE_STATUSES } from "./policy";

type Database = PrismaClient | Prisma.TransactionClient;
export const runnableSubscriptionWhere = {
  isActive: true,
  status: { in: [...RUNNABLE_STATUSES] },
};

export function questionHistoryWhere(
  sub: Subscription,
  cycle = sub.currentCycle,
): Prisma.PushLogWhereInput {
  return {
    targetType: sub.targetType,
    targetId: sub.targetId,
    ...(sub.mode === "CURRENT_EDITION"
      ? { cycle, generation: sub.generation }
      : {}),
  };
}
function questionScope(sub: Subscription): Prisma.QuestionWhereInput {
  return {
    bankId: sub.bankId,
    status: "PUBLISHED",
    ...(sub.mode === "CURRENT_EDITION"
      ? { id: { in: sub.editionQuestionIds } }
      : {}),
  };
}
export async function selectLearningQuestion(db: Database, sub: Subscription) {
  if (
    !sub.isActive ||
    !RUNNABLE_STATUSES.includes(sub.status as "ACTIVE" | "WAITING")
  )
    return null;
  let cycle = sub.currentCycle;
  async function next() {
    return db.question.findFirst({
      where: {
        ...questionScope(sub),
        pushLogs: { none: questionHistoryWhere(sub, cycle) },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }
  let question = await next();
  if (
    !question &&
    sub.mode === "CURRENT_EDITION" &&
    sub.endCondition === "REPEAT_N_TIMES" &&
    cycle + 1 < sub.repeatCount
  ) {
    cycle += 1;
    question = await next();
  }
  return question ? { question, cycle } : null;
}
export async function settleQuestionSubscription(
  db: Database,
  id: string,
  generation: number,
) {
  const sub = await db.subscription.findUnique({ where: { id } });
  if (!sub || sub.generation !== generation || !sub.isActive) return;
  const next = await selectLearningQuestion(db, sub);
  const status = next
    ? "ACTIVE"
    : sub.mode === "FOLLOW_UPDATES"
      ? "WAITING"
      : "COMPLETED";
  await db.subscription.updateMany({
    where: { id, generation, ...runnableSubscriptionWhere },
    data: {
      status,
      isActive: status !== "COMPLETED",
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
}
export async function questionProgress(db: Database, sub: Subscription) {
  const history = questionHistoryWhere(sub);
  const scope: Prisma.QuestionWhereInput = {
    bankId: sub.bankId,
    ...(sub.mode === "CURRENT_EDITION"
      ? { id: { in: sub.editionQuestionIds } }
      : {}),
    OR: [{ status: "PUBLISHED" }, { pushLogs: { some: history } }],
  };
  const [questionCount, pushedCount] = await Promise.all([
    db.question.count({ where: scope }),
    db.question.count({ where: { ...scope, pushLogs: { some: history } } }),
  ]);
  return { questionCount, pushedCount };
}
export function knowledgeHistoryWhere(
  sub: KnowledgeSubscription,
): Prisma.KnowledgePushLogWhereInput {
  return {
    subscriptionId: sub.id,
    ...(sub.mode === "CURRENT_EDITION" ? { generation: sub.generation } : {}),
  };
}
export async function selectLearningKnowledge(
  db: Database,
  sub: KnowledgeSubscription,
) {
  if (
    !sub.isActive ||
    !RUNNABLE_STATUSES.includes(sub.status as "ACTIVE" | "WAITING")
  )
    return null;
  return db.knowledgePoint.findFirst({
    where: {
      bankId: sub.bankId,
      ...(sub.mode === "CURRENT_EDITION"
        ? { id: { in: sub.editionPointIds } }
        : {}),
      pushLogs: { none: knowledgeHistoryWhere(sub) },
    },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}
export async function settleKnowledgeSubscription(
  db: Database,
  id: string,
  generation: number,
) {
  const sub = await db.knowledgeSubscription.findUnique({ where: { id } });
  if (!sub || sub.generation !== generation || !sub.isActive) return;
  const next = await selectLearningKnowledge(db, sub);
  const status = next
    ? "ACTIVE"
    : sub.mode === "FOLLOW_UPDATES"
      ? "WAITING"
      : "COMPLETED";
  await db.knowledgeSubscription.updateMany({
    where: { id, generation, ...runnableSubscriptionWhere },
    data: {
      status,
      isActive: status !== "COMPLETED",
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
}
export async function knowledgeProgress(
  db: Database,
  sub: KnowledgeSubscription,
) {
  const scope = {
    bankId: sub.bankId,
    ...(sub.mode === "CURRENT_EDITION"
      ? { id: { in: sub.editionPointIds } }
      : {}),
  };
  const [pointCount, pushedCount] = await Promise.all([
    db.knowledgePoint.count({ where: scope }),
    db.knowledgePoint.count({
      where: { ...scope, pushLogs: { some: knowledgeHistoryWhere(sub) } },
    }),
  ]);
  return { pointCount, pushedCount };
}
