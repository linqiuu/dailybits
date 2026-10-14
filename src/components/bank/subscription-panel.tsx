"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Pause, Play, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubscriptionPolicyFields } from "./subscription-policy-fields";
import {
  formatSubscriptionSchedule,
  isValidPushTime,
} from "@/lib/subscriptions/schedule";
import {
  learningModeLabels,
  learningStatusLabels,
} from "@/lib/subscriptions/policy";
import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type LearningSubscriptionMode,
  type LearningSubscriptionStatus,
  type SubscriptionCadence,
  type SubscriptionScheduleMode,
} from "@/types";

export interface SubscriptionSummary {
  id: string;
  pushTimes: string[];
  isActive: boolean;
  mode: LearningSubscriptionMode;
  status: LearningSubscriptionStatus;
  endCondition?: "END_AFTER_COMPLETE" | "REPEAT_N_TIMES";
  repeatCount?: number;
  currentCycle?: number;
}
interface Props {
  bankId: string;
  kind?: "QUESTION" | "KNOWLEDGE";
  targetType?: "USER" | "GROUP";
  targetId?: string;
  onChanged?: () => void;
  framed?: boolean;
  recommendedMode?: LearningSubscriptionMode;
  bankSchedule: {
    subscriptionScheduleMode: SubscriptionScheduleMode;
    subscriptionCadence: SubscriptionCadence;
    subscriptionWeekdays: number[];
    subscriptionPushTimes: string[];
  };
  initialSubscription?: SubscriptionSummary | null;
  totalQuestions?: number;
  pushedCount?: number;
}
export function SubscriptionPanel({
  bankId,
  kind = "QUESTION",
  targetType = "USER",
  targetId,
  onChanged,
  framed = true,
  recommendedMode = "CURRENT_EDITION",
  bankSchedule,
  initialSubscription = null,
  totalQuestions = 0,
  pushedCount = 0,
}: Props) {
  const router = useRouter();
  const [subscription, setSubscription] = useState(initialSubscription);
  const [pushTimes, setPushTimes] = useState(
    initialSubscription?.pushTimes ?? [...DEFAULT_PUSH_TIMES],
  );
  const [mode, setMode] = useState(
    initialSubscription?.mode ?? recommendedMode,
  );
  const [endCondition, setEndCondition] = useState(
    initialSubscription?.endCondition ?? "END_AFTER_COMPLETE",
  );
  const [repeatCount, setRepeatCount] = useState(
    initialSubscription?.repeatCount ?? 0,
  );
  const [newTime, setNewTime] = useState("09:30");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fixed = bankSchedule.subscriptionScheduleMode === "FIXED";
  const effectiveTimes = fixed
    ? bankSchedule.subscriptionPushTimes
    : (subscription?.pushTimes ?? pushTimes);
  const current =
    subscription &&
    subscription.status !== "COMPLETED" &&
    subscription.status !== "CANCELLED";
  const api =
    kind === "QUESTION"
      ? targetType === "GROUP"
        ? `/api/group/${targetId}/subscriptions`
        : "/api/subscriptions"
      : "/api/knowledge-subscriptions";
  const unit = kind === "QUESTION" ? "题" : "条";
  useEffect(() => {
    const timer = setTimeout(() => {
      setSubscription(initialSubscription);
      setPushTimes(initialSubscription?.pushTimes ?? [...DEFAULT_PUSH_TIMES]);
      setMode(initialSubscription?.mode ?? recommendedMode);
      setEndCondition(
        initialSubscription?.endCondition ?? "END_AFTER_COMPLETE",
      );
      setRepeatCount(initialSubscription?.repeatCount ?? 0);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialSubscription, recommendedMode]);
  function openEditor(open: boolean) {
    if (open && subscription) {
      setPushTimes(subscription.pushTimes);
      setMode(subscription.mode);
      setEndCondition(subscription.endCondition ?? "END_AFTER_COMPLETE");
      setRepeatCount(subscription.repeatCount ?? 0);
    }
    setEditOpen(open);
  }
  async function save(editing: boolean) {
    if (!fixed && !pushTimes.length) {
      toast.error("请至少保留一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        editing ? api + "/" + subscription!.id : api,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(!editing ? { bankId, targetType, targetId } : {}),
            mode,
            ...(!fixed ? { pushTimes } : {}),
            ...(kind === "QUESTION" ? { endCondition, repeatCount } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "订阅保存失败");
      setSubscription(body);
      setEditOpen(false);
      toast.success(editing ? "订阅设置已更新" : "订阅成功");
      onChanged?.();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "保存失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }
  async function changeState(action: "pause" | "resume" | "cancel") {
    if (!subscription) return;
    if (
      action === "cancel" &&
      !confirm("确定取消订阅吗？取消后题库更新不会恢复推送。")
    )
      return;
    setLoading(true);
    try {
      const response = await fetch(api + "/" + subscription.id, {
        method: action === "cancel" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action !== "cancel" ? { body: JSON.stringify({ action }) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "订阅更新失败");
      setSubscription(
        action === "cancel"
          ? { ...subscription, status: "CANCELLED", isActive: false }
          : body,
      );
      toast.success(
        action === "cancel"
          ? "已取消订阅"
          : action === "pause"
            ? "已暂停推送"
            : "已继续订阅",
      );
      onChanged?.();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "操作失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }
  const policy = (
    <SubscriptionPolicyFields
      mode={mode}
      onModeChange={setMode}
      endCondition={endCondition}
      repeatCount={repeatCount}
      onReviewChange={
        kind === "QUESTION"
          ? (end, count) => {
              setEndCondition(end);
              setRepeatCount(count);
            }
          : undefined
      }
      modeDisabled={!!current}
      disabled={loading}
    />
  );
  const times = (
    <div className="space-y-2">
      <Label htmlFor={"time-" + bankId}>推送时间</Label>
      <div className="flex gap-2">
        <Input
          id={"time-" + bankId}
          type="time"
          value={newTime}
          disabled={loading}
          onChange={(event) => setNewTime(event.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={
            loading ||
            pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION ||
            !isValidPushTime(newTime)
          }
          onClick={() => {
            setPushTimes([...new Set([...pushTimes, newTime])].sort());
            setNewTime("");
          }}
        >
          添加
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pushTimes.map((time) => (
          <Badge
            key={time}
            variant="secondary"
            render={
              <button
                type="button"
                disabled={loading}
                aria-label={"移除 " + time + " 推送时间"}
              />
            }
            onClick={() =>
              setPushTimes(pushTimes.filter((item) => item !== time))
            }
          >
            <Clock className="size-3" />
            {time}
            <X className="size-3" />
          </Badge>
        ))}
      </div>
    </div>
  );
  return (
    <aside className={framed ? "rounded-lg border bg-card p-4" : "space-y-3"}>
      {framed && (
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="size-4 text-primary" />
            订阅设置
          </h2>
          {subscription && (
            <Badge variant="outline">
              {learningStatusLabels[subscription.status]}
            </Badge>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {fixed ? formatSubscriptionSchedule(bankSchedule) : "自定义推送时间"}
        </p>
        {!framed && subscription && (
          <Badge variant="outline">
            {learningStatusLabels[subscription.status]}
          </Badge>
        )}
      </div>
      {current && !fixed && (
        <div className="mt-2 flex flex-wrap gap-2">
          {effectiveTimes.map((time) => (
            <Badge key={time} variant="secondary">
              <Clock className="size-3" />
              {time}
            </Badge>
          ))}
        </div>
      )}
      <div className={framed ? "mt-4 space-y-3 border-t pt-4" : "space-y-3"}>
        {current ? (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{learningModeLabels[subscription.mode]}</span>
              <span className="tabular-nums text-muted-foreground">
                {pushedCount} / {totalQuestions} {unit}
              </span>
            </div>
            {kind === "QUESTION" &&
              subscription.endCondition === "REPEAT_N_TIMES" && (
                <p className="text-xs text-muted-foreground">
                  第 {(subscription.currentCycle ?? 0) + 1} /{" "}
                  {subscription.repeatCount} 轮
                </p>
              )}
            <div className="flex flex-wrap gap-2">
              {(!fixed ||
                (kind === "QUESTION" &&
                  subscription.mode === "CURRENT_EDITION")) && (
                <Dialog open={editOpen} onOpenChange={openEditor}>
                  <DialogTrigger
                    render={
                      <Button variant="outline" size="sm" disabled={loading} />
                    }
                  >
                    编辑设置
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>编辑订阅设置</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {policy}
                      {!fixed && times}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setEditOpen(false)}
                        disabled={loading}
                      >
                        取消
                      </Button>
                      <Button
                        onClick={() => void save(true)}
                        disabled={loading}
                      >
                        保存
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() =>
                  void changeState(
                    subscription.status === "PAUSED" ? "resume" : "pause",
                  )
                }
              >
                {subscription.status === "PAUSED" ? (
                  <Play className="size-3.5" />
                ) : (
                  <Pause className="size-3.5" />
                )}
                {subscription.status === "PAUSED" ? "继续推送" : "暂停"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => void changeState("cancel")}
              >
                <Trash2 className="size-3.5" />
                取消订阅
              </Button>
            </div>
          </>
        ) : (
          <>
            {subscription?.status === "COMPLETED" && (
              <p className="text-sm text-muted-foreground">
                本期已推送完成，新增内容不会自动续订。
              </p>
            )}
            {policy}
            {!fixed && times}
            <Button disabled={loading} onClick={() => void save(false)}>
              {loading ? "保存中..." : subscription ? "重新订阅" : "确认订阅"}
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
