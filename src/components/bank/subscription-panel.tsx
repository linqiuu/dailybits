"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatSubscriptionSchedule,
  isValidPushTime,
} from "@/lib/subscriptions/schedule";
import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  type SubscriptionCadence,
  type SubscriptionScheduleMode,
} from "@/types";

type EndCondition = "END_AFTER_COMPLETE" | "REPEAT_N_TIMES";

interface SubscriptionPanelProps {
  bankId: string;
  bankSchedule: {
    subscriptionScheduleMode: SubscriptionScheduleMode;
    subscriptionCadence: SubscriptionCadence;
    subscriptionWeekdays: number[];
    subscriptionPushTimes: string[];
  };
  initialSubscription?: {
    id: string;
    pushTimes: string[];
    isActive: boolean;
    endCondition: EndCondition;
    repeatCount: number;
  } | null;
  totalQuestions: number;
  pushedCount: number;
}

function sortedTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}

export function SubscriptionPanel({
  bankId,
  bankSchedule,
  initialSubscription,
  totalQuestions,
  pushedCount,
}: SubscriptionPanelProps) {
  const router = useRouter();
  const [subscription, setSubscription] = useState(initialSubscription ?? null);
  const [pushTimes, setPushTimes] = useState<string[]>(
    initialSubscription?.pushTimes?.length ? initialSubscription.pushTimes : [...DEFAULT_PUSH_TIMES],
  );
  const [endCondition, setEndCondition] = useState<EndCondition>(
    initialSubscription?.endCondition ?? "END_AFTER_COMPLETE",
  );
  const [repeatCount, setRepeatCount] = useState(
    Math.max(1, initialSubscription?.repeatCount ?? 1),
  );
  const [newTime, setNewTime] = useState("09:30");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const fixedSchedule = bankSchedule.subscriptionScheduleMode === "FIXED";
  const effectiveTimes = fixedSchedule
    ? bankSchedule.subscriptionPushTimes
    : subscription?.pushTimes?.length
      ? subscription.pushTimes
      : pushTimes;
  const scheduleSummary = fixedSchedule
    ? formatSubscriptionSchedule(bankSchedule)
    : "订阅者自定义推送时间";
  const atTimeLimit = pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSubscription(initialSubscription ?? null);
      if (initialSubscription) {
        setPushTimes(initialSubscription.pushTimes);
        setEndCondition(initialSubscription.endCondition);
        setRepeatCount(Math.max(1, initialSubscription.repeatCount || 1));
      } else {
        setPushTimes([...DEFAULT_PUSH_TIMES]);
        setEndCondition("END_AFTER_COMPLETE");
        setRepeatCount(1);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSubscription]);

  useEffect(() => {
    if (!editOpen || !subscription) return;
    const timer = window.setTimeout(() => {
      setPushTimes(subscription.pushTimes);
      setEndCondition(subscription.endCondition);
      setRepeatCount(Math.max(1, subscription.repeatCount || 1));
      setNewTime("09:30");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editOpen, subscription]);

  const addTime = () => {
    const val = newTime.trim();
    if (!isValidPushTime(val)) {
      toast.error("请输入有效的 HH:MM 格式时间");
      return;
    }
    if (pushTimes.includes(val)) {
      toast.error("该时间已存在");
      return;
    }
    if (atTimeLimit) {
      toast.error(`推送时间不能超过 ${MAX_PUSH_TIMES_PER_SUBSCRIPTION} 个`);
      return;
    }
    setPushTimes((prev) => sortedTimes([...prev, val]));
    setNewTime("");
  };

  const removeTime = (time: string) => {
    setPushTimes((prev) => prev.filter((item) => item !== time));
  };

  const subscriptionPayload = (includeTimes: boolean) => ({
    bankId,
    ...(includeTimes ? { pushTimes } : {}),
    endCondition,
    repeatCount: endCondition === "REPEAT_N_TIMES" ? repeatCount : 0,
  });

  const validateEndCondition = () => {
    if (endCondition === "REPEAT_N_TIMES" && (!Number.isFinite(repeatCount) || repeatCount < 1)) {
      toast.error("循环次数须为大于 0 的整数");
      return false;
    }
    return true;
  };

  const handleSubscribe = async () => {
    if (!fixedSchedule && pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    if (!validateEndCondition()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscriptionPayload(!fixedSchedule)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("订阅成功");
      setSubscription({
        id: data.id,
        pushTimes: data.pushTimes ?? effectiveTimes,
        isActive: true,
        endCondition: data.endCondition ?? endCondition,
        repeatCount: data.repeatCount ?? 0,
      });
      router.refresh();
    } catch {
      toast.error("订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!fixedSchedule && pushTimes.length === 0) {
      toast.error("请至少保留一个推送时间");
      return;
    }
    if (!validateEndCondition()) return;
    if (!subscription) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(!fixedSchedule ? { pushTimes } : {}),
          endCondition,
          repeatCount: endCondition === "REPEAT_N_TIMES" ? repeatCount : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "更新失败");
        return;
      }
      toast.success("已更新");
      setSubscription((prev) =>
        prev
          ? {
              ...prev,
              pushTimes: data.pushTimes ?? prev.pushTimes,
              endCondition: data.endCondition ?? prev.endCondition,
              repeatCount: data.repeatCount ?? prev.repeatCount,
            }
          : prev,
      );
      setEditOpen(false);
      router.refresh();
    } catch {
      toast.error("更新失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!subscription) return;
    if (!confirm("确定要取消订阅吗？")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "取消订阅失败");
        return;
      }
      toast.success("已取消订阅");
      setSubscription(null);
      setPushTimes([...DEFAULT_PUSH_TIMES]);
      router.refresh();
    } catch {
      toast.error("取消订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const timeEditor = (
    <div className="space-y-2">
      <Label>推送时间</Label>
      <div className="flex gap-2">
        <Input
          type="time"
          aria-label="新增题库推送时间"
          value={newTime}
          onChange={(event) => setNewTime(event.target.value)}
          className="h-9 flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addTime}
          disabled={atTimeLimit}
        >
          添加
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pushTimes.map((time) => (
          <Badge
            key={time}
            render={<button type="button" aria-label={`移除 ${time} 推送时间`} />}
            variant="secondary"
            className="h-7 cursor-pointer rounded-md font-normal"
            onClick={() => removeTime(time)}
          >
            <Clock className="size-3" />
            {time} x
          </Badge>
        ))}
      </div>
    </div>
  );

  const endConditionEditor = (
    <div className="space-y-2">
      <Label>结束条件</Label>
      <Select
        value={endCondition}
        onValueChange={(value) => setEndCondition(value as EndCondition)}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {endCondition === "REPEAT_N_TIMES" ? "循环推送" : "推送完结束"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="END_AFTER_COMPLETE">推送完结束</SelectItem>
          <SelectItem value="REPEAT_N_TIMES">循环推送</SelectItem>
        </SelectContent>
      </Select>
      {endCondition === "REPEAT_N_TIMES" ? (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="sub-repeat-count">循环次数</Label>
          <Input
            id="sub-repeat-count"
            type="number"
            min={1}
            step={1}
            value={repeatCount}
            onChange={(event) =>
              setRepeatCount(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
            }
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h2 className="text-base font-semibold">订阅策略</h2>
          </div>
          <p className="text-sm text-muted-foreground">{scheduleSummary}</p>
          <div className="flex flex-wrap gap-2">
            {effectiveTimes.map((time) => (
              <Badge key={time} variant="secondary" className="rounded-md">
                <Clock className="size-3" />
                {time}
              </Badge>
            ))}
          </div>
        </div>
        {subscription ? (
          <Badge className="shrink-0 bg-success/10 text-success">已订阅</Badge>
        ) : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {subscription ? (
          <>
            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="rounded-md bg-muted/50 px-3 py-2">
                进度 {pushedCount} / {totalQuestions} 题
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2">
                {subscription.endCondition === "REPEAT_N_TIMES"
                  ? `循环推送 ${subscription.repeatCount} 次`
                  : "推送完结束"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
                  编辑订阅
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>编辑订阅</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {endConditionEditor}
                    {!fixedSchedule ? timeEditor : null}
                    {fixedSchedule ? (
                      <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                        推送时间由题库创建者统一设置。
                      </div>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setEditOpen(false)}
                      disabled={loading}
                    >
                      取消
                    </Button>
                    <Button onClick={handleUpdate} disabled={loading}>
                      保存
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUnsubscribe}
                disabled={loading}
              >
                <Trash2 className="size-3.5" />
                取消订阅
              </Button>
            </div>
          </>
        ) : (
          <>
            {!fixedSchedule ? timeEditor : null}
            {endConditionEditor}
            <Button onClick={handleSubscribe} disabled={loading}>
              {loading ? "订阅中..." : "订阅题库"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
