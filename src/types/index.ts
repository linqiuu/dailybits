export type TargetType = "USER" | "GROUP";
export type DigestType = "GITHUB_TRENDING" | "AI_NEWS" | "ARXIV_AI_PAPERS";
export type SubscriptionScheduleMode = "CUSTOM" | "FIXED";
export type SubscriptionCadence = "DAILY" | "WEEKLY";
export type LearningSubscriptionMode = "CURRENT_EDITION" | "FOLLOW_UPDATES";
export type LearningSubscriptionStatus = "ACTIVE" | "WAITING" | "COMPLETED" | "PAUSED" | "CANCELLED";

export const MAX_SUBSCRIPTIONS_PER_TARGET = 5;
export const MAX_DIGEST_SUBSCRIPTIONS_PER_TARGET = 3;
export const MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET = 5;
export const MAX_PUSH_TIMES_PER_SUBSCRIPTION = 15;
export const DEFAULT_PUSH_TIMES = ["09:30", "14:00"];
export const DEFAULT_DIGEST_PUSH_TIMES = ["09:00"];
export const DEFAULT_KNOWLEDGE_PUSH_TIMES = DEFAULT_PUSH_TIMES;

export interface GeneratedQuestion {
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface GeneratedKnowledgePoint {
  content: string;
}

export interface PushPayload {
  receiver: string;
  title: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  authorId?: string;
  businessId?: string;
  domain?: string;
  scene?: string;
  idempotencyKey?: string;
}

export interface DigestPushPayload {
  receiver: string;
  title: string;
  items: string[];
  digestType: DigestType;
  digestDate: string;
  idempotencyKey?: string;
}

export interface KnowledgePushPayload {
  receiver: string;
  title: string;
  items: string[];
  knowledgeBankId: string;
  knowledgePointId: string;
  idempotencyKey?: string;
}
