"use client";

import { Clock, CalendarDays, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ISO_WEEKDAYS,
  formatSubscriptionSchedule,
  isValidPushTime,
} from "@/lib/subscriptions/schedule";
import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type SubscriptionCadence,
  type SubscriptionScheduleMode,
} from "@/types";
import { cn } from "@/lib/utils";
import { SubscriptionPolicyFields } from "./subscription-policy-fields";
import type { LearningSubscriptionMode } from "@/types";

export type ScheduleDraft = {
  recommendedSubscriptionMode?: LearningSubscriptionMode;
  subscriptionScheduleMode: SubscriptionScheduleMode;
  subscriptionCadence: SubscriptionCadence;
  subscriptionWeekdays: number[];
  subscriptionPushTimes: string[];
};

interface SubscriptionScheduleFormProps {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  newTime: string;
  onNewTimeChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

function sortedTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}

export function defaultScheduleDraft(): ScheduleDraft {
  return {
    recommendedSubscriptionMode: "CURRENT_EDITION",
    subscriptionScheduleMode: "CUSTOM",
    subscriptionCadence: "DAILY",
    subscriptionWeekdays: [],
    subscriptionPushTimes: [...DEFAULT_PUSH_TIMES],
  };
}

export function SubscriptionScheduleForm({
  value,
  onChange,
  newTime,
  onNewTimeChange,
  disabled = false,
  compact = false,
}: SubscriptionScheduleFormProps) {
  const fixed = value.subscriptionScheduleMode === "FIXED";
  const atTimeLimit =
    value.subscriptionPushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;

  const update = (patch: Partial<ScheduleDraft>) => {
    onChange({ ...value, ...patch });
  };

  const addTime = () => {
    const time = newTime.trim();
    if (!isValidPushTime(time) || atTimeLimit) return;
    update({ subscriptionPushTimes: sortedTimes([...value.subscriptionPushTimes, time]) });
    onNewTimeChange("");
  };

  const removeTime = (time: string) => {
    const next = value.subscriptionPushTimes.filter((item) => item !== time);
    update({ subscriptionPushTimes: next.length ? next : [...DEFAULT_PUSH_TIMES] });
  };

  const toggleWeekday = (weekday: number) => {
    const exists = value.subscriptionWeekdays.includes(weekday);
    const next = exists
      ? value.subscriptionWeekdays.filter((item) => item !== weekday)
      : [...value.subscriptionWeekdays, weekday];
    update({ subscriptionWeekdays: next.sort((a, b) => a - b) });
  };

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <SubscriptionPolicyFields label="推荐订阅模式" mode={value.recommendedSubscriptionMode ?? "CURRENT_EDITION"} onModeChange={mode => update({ recommendedSubscriptionMode: mode })} disabled={disabled} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => update({ subscriptionScheduleMode: "CUSTOM" })}
          className={cn(
            "rounded-md border p-3 text-left transition-colors",
            value.subscriptionScheduleMode === "CUSTOM"
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-card hover:bg-muted/60",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <UserRoundCog className="size-4 text-primary" />
            订阅者自定义
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            用户订阅时自己选择每天的推送时间。
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => update({ subscriptionScheduleMode: "FIXED" })}
          className={cn(
            "rounded-md border p-3 text-left transition-colors",
            value.subscriptionScheduleMode === "FIXED"
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-card hover:bg-muted/60",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" />
            创建者固定
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            用户直接订阅，按题库配置统一推送。
          </span>
        </button>
      </div>

      {fixed ? (
        <div className="space-y-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="space-y-2">
            <Label>推送周期</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["DAILY", "每天"],
                  ["WEEKLY", "每周"],
                ] as const
              ).map(([cadence, label]) => (
                <button
                  key={cadence}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    update({
                      subscriptionCadence: cadence,
                      subscriptionWeekdays:
                        cadence === "WEEKLY" && value.subscriptionWeekdays.length === 0
                          ? [1]
                          : value.subscriptionWeekdays,
                    })
                  }
                  className={cn(
                    "h-9 rounded-md border text-sm font-medium transition-colors",
                    value.subscriptionCadence === cadence
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {value.subscriptionCadence === "WEEKLY" ? (
            <div className="space-y-2">
              <Label>每周几推送</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {ISO_WEEKDAYS.map((weekday) => {
                  const checked = value.subscriptionWeekdays.includes(weekday.value);
                  return (
                    <button
                      key={weekday.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleWeekday(weekday.value)}
                      className={cn(
                        "h-9 rounded-md border text-xs font-medium transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                      aria-label={weekday.label}
                    >
                      {weekday.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>固定推送时间</Label>
            <div className="flex gap-2">
              <Input
                type="time"
                value={newTime}
                onChange={(event) => onNewTimeChange(event.target.value)}
                disabled={disabled || atTimeLimit}
                className="h-9 flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addTime}
                disabled={disabled || atTimeLimit || !isValidPushTime(newTime)}
              >
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {value.subscriptionPushTimes.map((time) => (
                <Badge
                  key={time}
                  variant="secondary"
                  className="h-7 rounded-md font-normal"
                >
                  <Clock className="size-3" />
                  {time}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeTime(time)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label={`移除 ${time}`}
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-card px-3 py-2 text-sm text-muted-foreground">
            当前策略：{formatSubscriptionSchedule(value)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
