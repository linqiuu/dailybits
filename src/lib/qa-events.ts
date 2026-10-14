import type { PrismaClient } from "../generated/prisma/client";
import { internalFetch } from "./http/outbound";

export class AnswerEventError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function answer(value: unknown): string { return text(value).toLowerCase().match(/^[a-d](?=$|[\s.、:：)）])/)?.[0] || ""; }

export async function recordAnswerEvent(prisma: PrismaClient, body: Record<string, unknown>) {
  const cardId = text(body.card_id ?? body.cardId);
  const receiver = text(body.receiver);
  const respondentId = text(body.account_id ?? body.accountId ?? body.respondentId);
  const questionId = text(body.business_id ?? body.businessId ?? body.questionId);
  const selectedAnswer = answer(body.selected_answer ?? body.selectedAnswer);
  const answeredAtRaw = text(body.answered_at ?? body.answeredAt);
  const answeredAt = answeredAtRaw ? new Date(answeredAtRaw) : new Date();
  if (!cardId || !receiver || !respondentId || !questionId || !selectedAnswer || [cardId, receiver, respondentId, questionId].some((value) => value.length > 255) || Number.isNaN(answeredAt.getTime())) {
    throw new AnswerEventError(400, "Invalid QA answer event");
  }
  const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true, bankId: true, correctAnswer: true, content: true } });
  if (!question) throw new AnswerEventError(404, "Question not found");
  const correctAnswer = answer(body.correct_answer ?? body.correctAnswer) || answer(question.correctAnswer);
  if (!correctAnswer) throw new AnswerEventError(400, "Invalid correct answer");
  return prisma.questionAnswerEvent.upsert({
    where: { cardId_respondentId: { cardId, respondentId } },
    create: { cardId, receiver, respondentId, questionId, bankId: question.bankId, selectedAnswer, correctAnswer, isCorrect: selectedAnswer === correctAnswer, answeredAt, sourceSystem: text(body.source_system ?? body.sourceSystem) || "card-service", questionContentSnapshot: question.content, identityBackfilled: Date.now() - answeredAt.getTime() > 600000 },
    update: {},
  });
}

export async function syncAnswerEvents(prisma: PrismaClient): Promise<void> {
  const base = process.env.CARD_SERVICE_API_BASE?.trim();
  if (!base || process.env.PUSH_PROVIDER !== "card-service") return;
  const checkpoint = await prisma.schedulerState.findUnique({ where: { id: "qa-answers" } });
  let cursor = Number(checkpoint?.cursor || 0);
  try {
    for (let page = 0; page < 5; page++) {
      const url = new URL("/api/v1/qa/answers", base);
      url.searchParams.set("source_system", "dailybits");
      url.searchParams.set("after_id", String(cursor));
      url.searchParams.set("limit", "1000");
      const response = await internalFetch(url, { headers: { [process.env.CARD_SERVICE_SEND_API_KEY_HEADER || "X-Card-Service-Key"]: process.env.CARD_SERVICE_SEND_API_KEY || "" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("ANSWER_SYNC_UNAVAILABLE");
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error("INVALID_ANSWER_SYNC_RESPONSE");
      for (const raw of rows) {
        const row = raw as Record<string, unknown>;
        if (!Number.isSafeInteger(row.id) || Number(row.id) <= cursor) throw new Error("INVALID_ANSWER_CURSOR");
        try { await recordAnswerEvent(prisma, row); }
        catch (error) { if (!(error instanceof AnswerEventError)) throw error; }
        cursor = Number(row.id);
      }
      const now = new Date();
      await prisma.schedulerState.upsert({ where: { id: "qa-answers" }, create: { id: "qa-answers", lastTickAt: now, cursor: String(cursor) }, update: { lastTickAt: now, cursor: String(cursor), lastErrorCode: null } });
      if (rows.length < 1000) break;
    }
  } catch {
    await prisma.schedulerState.upsert({ where: { id: "qa-answers" }, create: { id: "qa-answers", lastTickAt: new Date(0), cursor: String(cursor), lastErrorCode: "ANSWER_SYNC_UNAVAILABLE" }, update: { lastErrorCode: "ANSWER_SYNC_UNAVAILABLE" } });
  }
}
