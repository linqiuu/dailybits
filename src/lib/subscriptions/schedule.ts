import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type SubscriptionCadence,
  type SubscriptionScheduleMode,
} from "../../types";
import { LEARNING_MODES } from "./policy";
import type { LearningSubscriptionMode } from "../../types";

export const SUBSCRIPTION_SCHEDULE_MODES = ["CUSTOM", "FIXED"] as const;
export const SUBSCRIPTION_CADENCES = ["DAILY", "WEEKLY"] as const;
export const ISO_WEEKDAYS = [
  { value: 1, label: "周一", shortLabel: "一" },
  { value: 2, label: "周二", shortLabel: "二" },
  { value: 3, label: "周三", shortLabel: "三" },
  { value: 4, label: "周四", shortLabel: "四" },
  { value: 5, label: "周五", shortLabel: "五" },
  { value: 6, label: "周六", shortLabel: "六" },
  { value: 7, label: "周日", shortLabel: "日" },
] as const;

export type QuestionBankScheduleInput = {
  recommendedSubscriptionMode?: unknown;
  subscriptionScheduleMode?: unknown;
  subscriptionCadence?: unknown;
  subscriptionWeekdays?: unknown;
  subscriptionPushTimes?: unknown;
};

export type QuestionBankScheduleFields = {
  recommendedSubscriptionMode?: LearningSubscriptionMode;
  subscriptionScheduleMode: SubscriptionScheduleMode;
  subscriptionCadence: SubscriptionCadence;
  subscriptionWeekdays: number[];
  subscriptionPushTimes: string[];
};

export type ScheduleParseResult =
  | { ok: true; value: QuestionBankScheduleFields }
  | { ok: false; error: string };

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidPushTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function normalizePushTimes(
  value: unknown,
  fallback: string[] = DEFAULT_PUSH_TIMES,
): string[] | null {
  const raw = Array.isArray(value) && value.length > 0 ? value : fallback;
  const seen = new Set<string>();
  const times: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!isValidPushTime(trimmed)) return null;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      times.push(trimmed);
    }
  }
  return times.sort();
}

function normalizeWeekdays(value: unknown, fallback: number[] = []): number[] | null {
  const raw = value === undefined ? fallback : value;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<number>();
  const weekdays: number[] = [];
  for (const item of raw) {
    const numberValue =
      typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN;
    if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 7) {
      return null;
    }
    if (!seen.has(numberValue)) {
      seen.add(numberValue);
      weekdays.push(numberValue);
    }
  }
  return weekdays.sort((a, b) => a - b);
}

export function parseQuestionBankSchedule(
  body: QuestionBankScheduleInput,
  current?: Partial<QuestionBankScheduleFields>,
): ScheduleParseResult {
  const recommended = body.recommendedSubscriptionMode === undefined ? current?.recommendedSubscriptionMode ?? "CURRENT_EDITION" : body.recommendedSubscriptionMode;
  if (!LEARNING_MODES.includes(recommended as LearningSubscriptionMode)) return { ok: false, error: "推荐订阅模式无效" };
  const mode =
    body.subscriptionScheduleMode === undefined
      ? current?.subscriptionScheduleMode ?? "CUSTOM"
      : body.subscriptionScheduleMode;
  if (
    typeof mode !== "string" ||
    !SUBSCRIPTION_SCHEDULE_MODES.includes(mode as SubscriptionScheduleMode)
  ) {
    return {
      ok: false,
      error: "subscriptionScheduleMode must be CUSTOM or FIXED",
    };
  }

  const cadence =
    body.subscriptionCadence === undefined
      ? current?.subscriptionCadence ?? "DAILY"
      : body.subscriptionCadence;
  if (
    typeof cadence !== "string" ||
    !SUBSCRIPTION_CADENCES.includes(cadence as SubscriptionCadence)
  ) {
    return {
      ok: false,
      error: "subscriptionCadence must be DAILY or WEEKLY",
    };
  }

  const pushTimes = normalizePushTimes(
    body.subscriptionPushTimes,
    current?.subscriptionPushTimes?.length
      ? current.subscriptionPushTimes
      : DEFAULT_PUSH_TIMES,
  );
  if (!pushTimes || pushTimes.length === 0) {
    return {
      ok: false,
      error: "subscriptionPushTimes must contain valid HH:MM time strings",
    };
  }
  if (pushTimes.length > MAX_PUSH_TIMES_PER_SUBSCRIPTION) {
    return {
      ok: false,
      error: `subscriptionPushTimes cannot exceed ${MAX_PUSH_TIMES_PER_SUBSCRIPTION}`,
    };
  }

  const weekdays = normalizeWeekdays(
    body.subscriptionWeekdays,
    current?.subscriptionWeekdays ?? [],
  );
  if (!weekdays) {
    return {
      ok: false,
      error: "subscriptionWeekdays must be an array of integers from 1 to 7",
    };
  }

  const resolvedCadence = cadence as SubscriptionCadence;
  const resolvedWeekdays =
    resolvedCadence === "WEEKLY" ? (weekdays.length ? weekdays : [1]) : [];

  return {
    ok: true,
    value: {
      recommendedSubscriptionMode: recommended as LearningSubscriptionMode,
      subscriptionScheduleMode: mode as SubscriptionScheduleMode,
      subscriptionCadence: resolvedCadence,
      subscriptionWeekdays: resolvedWeekdays,
      subscriptionPushTimes: pushTimes,
    },
  };
}

export function formatSubscriptionSchedule(
  schedule: Pick<
    QuestionBankScheduleFields,
    "subscriptionScheduleMode" | "subscriptionCadence" | "subscriptionWeekdays" | "subscriptionPushTimes"
  >,
): string {
  if (schedule.subscriptionScheduleMode === "CUSTOM") {
    return "订阅者自定义推送时间";
  }
  const times = schedule.subscriptionPushTimes.join("、");
  if (schedule.subscriptionCadence === "DAILY") {
    return `每天 ${times}`;
  }
  const weekdayLabels = schedule.subscriptionWeekdays
    .map((value) => ISO_WEEKDAYS.find((item) => item.value === value)?.label)
    .filter(Boolean)
    .join("、");
  return `${weekdayLabels || "周一"} ${times}`;
}

export function isoWeekdayInTimeZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);
  return (
    {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    } as Record<string, number>
  )[weekday] ?? 1;
}
