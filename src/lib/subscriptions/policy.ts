import type {
  LearningSubscriptionMode,
  LearningSubscriptionStatus,
} from "../../types";

export const LEARNING_MODES = ["CURRENT_EDITION", "FOLLOW_UPDATES"] as const;
export const learningModeLabels: Record<LearningSubscriptionMode, string> = {
  CURRENT_EDITION: "学完本期结束",
  FOLLOW_UPDATES: "持续跟进更新",
};
export const learningStatusLabels: Record<LearningSubscriptionStatus, string> =
  {
    ACTIVE: "推送中",
    WAITING: "等待更新",
    COMPLETED: "本期已完成",
    PAUSED: "已暂停",
    CANCELLED: "已取消",
  };
export const RUNNABLE_STATUSES = ["ACTIVE", "WAITING"] as const;
export const RESERVED_STATUSES = ["ACTIVE", "WAITING", "PAUSED"] as const;

export class SubscriptionPolicyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function parseLearningMode(
  value: unknown,
  fallback: LearningSubscriptionMode,
): LearningSubscriptionMode {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !LEARNING_MODES.includes(value as LearningSubscriptionMode)
  ) {
    throw new SubscriptionPolicyError("订阅模式无效");
  }
  return value as LearningSubscriptionMode;
}
export function parseLearningPolicy(
  body: Record<string, unknown>,
  fallback: {
    mode: LearningSubscriptionMode;
    endCondition?: "END_AFTER_COMPLETE" | "REPEAT_N_TIMES";
    repeatCount?: number;
  },
) {
  const mode = parseLearningMode(body.mode, fallback.mode);
  const endCondition =
    body.endCondition === undefined
      ? (fallback.endCondition ?? "END_AFTER_COMPLETE")
      : body.endCondition;
  const repeatCount =
    body.repeatCount === undefined
      ? (fallback.repeatCount ?? 0)
      : body.repeatCount;
  if (
    !["END_AFTER_COMPLETE", "REPEAT_N_TIMES"].includes(String(endCondition)) ||
    typeof repeatCount !== "number" ||
    !Number.isInteger(repeatCount) ||
    repeatCount < 0 ||
    repeatCount > 2147483647
  ) {
    throw new SubscriptionPolicyError("复习设置无效");
  }
  if (endCondition === "REPEAT_N_TIMES" && repeatCount < 1)
    throw new SubscriptionPolicyError("推送轮数至少为 1");
  if (mode === "FOLLOW_UPDATES" && endCondition === "REPEAT_N_TIMES") {
    throw new SubscriptionPolicyError("持续跟进更新不重复推送旧题，请关闭复习");
  }
  return {
    mode,
    endCondition: endCondition as "END_AFTER_COMPLETE" | "REPEAT_N_TIMES",
    repeatCount: endCondition === "REPEAT_N_TIMES" ? repeatCount : 0,
  };
}
