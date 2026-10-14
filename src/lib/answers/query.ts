import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { atZonedTime } from "../time";

export const ANSWER_SORTS = [
  "time-desc",
  "time-asc",
  "incorrect-first",
  "correct-first",
] as const;
export type AnswerSort = (typeof ANSWER_SORTS)[number];
export interface AnswerFilters {
  q: string;
  result: "all" | "correct" | "incorrect";
  questionId: string;
  from: string;
  to: string;
  sort: AnswerSort;
  page: number;
  pageSize: number;
}
export class AnswerQueryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function calendarDate(value: string): string {
  if (!value) return "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new AnswerQueryError("日期格式无效");
  return value;
}
export function parseAnswerFilters(params: URLSearchParams): AnswerFilters {
  const q = (params.get("q") || "").trim();
  const result = params.get("result") || "all";
  const sort = params.get("sort") || "time-desc";
  const questionId = params.get("questionId") || "";
  const from = calendarDate(params.get("from") || "");
  const to = calendarDate(params.get("to") || "");
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 25);
  if (q.length > 128 || questionId.length > 128)
    throw new AnswerQueryError("搜索内容过长");
  if (
    !["all", "correct", "incorrect"].includes(result) ||
    !ANSWER_SORTS.includes(sort as AnswerSort)
  )
    throw new AnswerQueryError("筛选或排序条件无效");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    ![25, 50, 100].includes(pageSize)
  )
    throw new AnswerQueryError("分页参数无效");
  if (from && to && from > to)
    throw new AnswerQueryError("开始日期不能晚于结束日期");
  return {
    q,
    result: result as AnswerFilters["result"],
    sort: sort as AnswerSort,
    questionId,
    from,
    to,
    page,
    pageSize,
  };
}

export function answerWhere(
  bankId: string,
  filters: AnswerFilters,
): Prisma.QuestionAnswerEventWhereInput {
  const where: Prisma.QuestionAnswerEventWhereInput = { bankId };
  if (filters.result !== "all") where.isCorrect = filters.result === "correct";
  if (filters.questionId) where.questionId = filters.questionId;
  if (filters.q)
    where.OR = [
      "respondentNameSnapshot",
      "respondentEmployeeNoSnapshot",
      "respondentId",
    ].map((field) => ({
      [field]: { contains: filters.q, mode: "insensitive" },
    }));
  if (filters.from || filters.to) {
    const nextDay = filters.to ? new Date(`${filters.to}T00:00:00Z`) : null;
    if (nextDay) nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    where.answeredAt = {
      ...(filters.from
        ? { gte: atZonedTime(filters.from, "00:00", "Asia/Shanghai") }
        : {}),
      ...(nextDay
        ? {
            lt: atZonedTime(
              nextDay.toISOString().slice(0, 10),
              "00:00",
              "Asia/Shanghai",
            ),
          }
        : {}),
    };
  }
  return where;
}

export function answerOrder(
  sort: AnswerSort,
): Prisma.QuestionAnswerEventOrderByWithRelationInput[] {
  if (sort === "incorrect-first" || sort === "correct-first")
    return [
      { isCorrect: sort === "incorrect-first" ? "asc" : "desc" },
      { answeredAt: "desc" },
      { id: "desc" },
    ];
  const order = sort === "time-asc" ? "asc" : "desc";
  return [{ answeredAt: order }, { id: order }];
}

export function canReadAnswerDetails(
  bank: { creatorId: string },
  user: { id: string; isAdmin?: boolean } | null | undefined,
): boolean {
  return !!user && (bank.creatorId === user.id || user.isAdmin === true);
}

export const answerSelect = {
  id: true,
  respondentId: true,
  respondentUserId: true,
  respondentNameSnapshot: true,
  respondentEmployeeNoSnapshot: true,
  identityStatus: true,
  identityCapturedAt: true,
  identityBackfilled: true,
  questionId: true,
  questionContentSnapshot: true,
  selectedAnswer: true,
  correctAnswer: true,
  isCorrect: true,
  answeredAt: true,
  question: { select: { content: true } },
} satisfies Prisma.QuestionAnswerEventSelect;
export type SelectedAnswer = Prisma.QuestionAnswerEventGetPayload<{
  select: typeof answerSelect;
}>;
export function answerView(row: SelectedAnswer) {
  return {
    id: row.id,
    accountId: row.respondentId,
    name: row.respondentNameSnapshot,
    employeeNo: row.respondentEmployeeNoSnapshot,
    identityStatus: row.identityStatus,
    identityCapturedAt: row.identityCapturedAt?.toISOString() ?? null,
    identityBackfilled: row.identityBackfilled,
    questionId: row.questionId,
    question: row.questionContentSnapshot ?? row.question.content,
    questionSnapshotAvailable: row.questionContentSnapshot !== null,
    selectedAnswer: row.selectedAnswer.toUpperCase(),
    correctAnswer: row.correctAnswer.toUpperCase(),
    isCorrect: row.isCorrect,
    answeredAt: row.answeredAt.toISOString(),
  };
}
export type AnswerRecordView = ReturnType<typeof answerView>;
export interface AnswerRecordsResponse {
  items: AnswerRecordView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: { correct: number; incorrect: number; missingIdentities: number };
  questions: Array<{ id: string; content: string }>;
  identitySync: { lastCompletedAt: string | null; unavailable: boolean };
}

export async function listAnswerRecords(
  prisma: PrismaClient,
  bankId: string,
  filters: AnswerFilters,
): Promise<AnswerRecordsResponse> {
  return prisma.$transaction(
    async (tx) => {
      const where = answerWhere(bankId, filters);
      const [total, correct, missingIdentities, questions, checkpoint] =
        await Promise.all([
          tx.questionAnswerEvent.count({ where }),
          tx.questionAnswerEvent.count({
            where: { AND: [where, { isCorrect: true }] },
          }),
          tx.questionAnswerEvent.count({
            where: { AND: [where, { identityStatus: { not: "RESOLVED" } }] },
          }),
          tx.question.findMany({
            where: { bankId },
            select: { id: true, content: true },
            orderBy: { createdAt: "asc" },
          }),
          tx.schedulerState.findUnique({ where: { id: "qa-identities" } }),
        ]);
      const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
      const page = Math.min(filters.page, totalPages);
      const rows = await tx.questionAnswerEvent.findMany({
        where,
        select: answerSelect,
        orderBy: answerOrder(filters.sort),
        skip: (page - 1) * filters.pageSize,
        take: filters.pageSize,
      });
      return {
        items: rows.map(answerView),
        total,
        page,
        pageSize: filters.pageSize,
        totalPages,
        summary: { correct, incorrect: total - correct, missingIdentities },
        questions,
        identitySync: {
          lastCompletedAt: checkpoint?.lastTickAt.getTime()
            ? checkpoint.lastTickAt.toISOString()
            : null,
          unavailable: !!checkpoint?.lastErrorCode,
        },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
