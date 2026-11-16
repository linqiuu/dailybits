"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { learningModeLabels, pushOrderLabels } from "@/lib/subscriptions/policy";
import type { LearningSubscriptionMode, SubscriptionPushOrder } from "@/types";

export function SubscriptionPolicyFields({
  mode,
  onModeChange,
  pushOrder = "SEQUENTIAL",
  onPushOrderChange,
  endCondition = "END_AFTER_COMPLETE",
  repeatCount = 0,
  onReviewChange,
  modeDisabled = false,
  disabled = false,
  label = "订阅模式",
}: {
  mode: LearningSubscriptionMode;
  onModeChange: (mode: LearningSubscriptionMode) => void;
  pushOrder?: SubscriptionPushOrder;
  onPushOrderChange?: (order: SubscriptionPushOrder) => void;
  endCondition?: "END_AFTER_COMPLETE" | "REPEAT_N_TIMES";
  repeatCount?: number;
  onReviewChange?: (
    end: "END_AFTER_COMPLETE" | "REPEAT_N_TIMES",
    count: number,
  ) => void;
  modeDisabled?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={mode}
          disabled={disabled || modeDisabled}
          onValueChange={(value) => {
            if (!value) return;
            onModeChange(value as LearningSubscriptionMode);
            if (value === "FOLLOW_UPDATES")
              onReviewChange?.("END_AFTER_COMPLETE", 0);
          }}
        >
          <SelectTrigger id={id} aria-label={label} className="w-full">
            <SelectValue>{learningModeLabels[mode]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(learningModeLabels).map(([value, text]) => (
              <SelectItem key={value} value={value}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {onPushOrderChange ? (
        <div className="space-y-2">
          <Label htmlFor={id + "-order"}>推送顺序</Label>
          <Select value={pushOrder} disabled={disabled} onValueChange={(value) => {
            if (value === "SEQUENTIAL" || value === "RANDOM") onPushOrderChange(value);
          }}>
            <SelectTrigger id={id + "-order"} aria-label="推送顺序" className="w-full">
              <SelectValue>{pushOrderLabels[pushOrder]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(pushOrderLabels).map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {mode === "CURRENT_EDITION" && onReviewChange && (
        <div className="space-y-2">
          <Label htmlFor={id + "-reviews"}>额外复习轮数</Label>
          <Input
            id={id + "-reviews"}
            type="number"
            min={0}
            max={2147483646}
            step={1}
            disabled={disabled}
            value={
              endCondition === "REPEAT_N_TIMES"
                ? Math.max(0, repeatCount - 1)
                : 0
            }
            onChange={(event) => {
              const reviews = Math.min(
                2147483646,
                Math.max(0, Number.parseInt(event.target.value, 10) || 0),
              );
              onReviewChange(
                reviews > 0 ? "REPEAT_N_TIMES" : "END_AFTER_COMPLETE",
                reviews > 0 ? reviews + 1 : 0,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
