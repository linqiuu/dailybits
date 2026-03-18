import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export type TargetType = "USER" | "GROUP";

export const MAX_SUBSCRIPTIONS_PER_TARGET = 5;
export const MAX_PUSH_TIMES_PER_SUBSCRIPTION = 10;
export const DEFAULT_PUSH_TIMES = ["09:30", "14:00", "17:00"];

export interface GeneratedQuestion {
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface PushPayload {
  receiver: string;
  title: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}
