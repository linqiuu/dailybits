import type { PushPayload } from "@/types";

type PushQuestion = {
  content: string;
  options: unknown;
  correctAnswer: string;
  explanation: string;
};

export function buildPayload(receiver: string, title: string, question: PushQuestion): PushPayload {
  return {
    receiver,
    title,
    question: question.content,
    options: question.options as string[],
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  };
}
