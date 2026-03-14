import type { PushPayload } from "@/types";

export function buildPayload(receiver: string, question: any): PushPayload {
  return {
    receiver,
    question: question.content,
    options: question.options as string[],
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  };
}
