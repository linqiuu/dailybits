"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, Clock, Plus, X } from "lucide-react";
import { LearningCatalogCard } from "@/components/ui/learning-catalog-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { SubscriptionPolicyFields } from "./subscription-policy-fields";
import type { LearningSubscriptionMode } from "@/types";
import { toast } from "sonner";
import {
  MAX_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  DEFAULT_PUSH_TIMES,
  type SubscriptionCadence,
  type SubscriptionScheduleMode,
} from "@/types";
import {
  formatSubscriptionSchedule,
  isValidPushTime,
} from "@/lib/subscriptions/schedule";

export interface BankCardProps {
  id: string;
  title: string;
  description: string | null;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null; };
  questionCount: number;
  subscriberCount: number;
  answerCount?: number;
  correctAnswerCount?: number;
  answererCount?: number;
  subscriptionScheduleMode: SubscriptionScheduleMode;
  subscriptionCadence: SubscriptionCadence;
  subscriptionWeekdays: number[];
  subscriptionPushTimes: string[];
  recommendedSubscriptionMode?: LearningSubscriptionMode;
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  subscriptionCount?: number;
}

export function BankCard({
  id,
  title,
  description,
  creator,
  questionCount,
  subscriberCount,
  answerCount = 0,
  correctAnswerCount = 0,
  answererCount = 0,
  subscriptionScheduleMode,
  subscriptionCadence,
  subscriptionWeekdays,
  subscriptionPushTimes,
  recommendedSubscriptionMode = "CURRENT_EDITION",
  isLoggedIn = false,
  isSubscribed = false,
  subscriptionCount = 0,
}: BankCardProps) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [subCount, setSubCount] = useState(subscriberCount);
  const [open, setOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>([...DEFAULT_PUSH_TIMES]);
  const [newTime, setNewTime] = useState("08:00");
  const [loading, setLoading] = useState(false);
  const [endCondition, setEndCondition] = useState<"END_AFTER_COMPLETE" | "REPEAT_N_TIMES">(
    "END_AFTER_COMPLETE"
  );
  const [repeatCount, setRepeatCount] = useState(0);
  const [mode, setMode] = useState(recommendedSubscriptionMode);

  const atSubLimit = subscriptionCount >= MAX_SUBSCRIPTIONS_PER_TARGET;
  const atTimeLimit = pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;
  const fixedSchedule = subscriptionScheduleMode === "FIXED";
  const scheduleSummary = formatSubscriptionSchedule({
    subscriptionScheduleMode,
    subscriptionCadence,
    subscriptionWeekdays,
    subscriptionPushTimes,
  });
  const accuracy =
    answerCount > 0 ? Math.round((correctAnswerCount / answerCount) * 1000) / 10 : null;

  const addTime = () => {
    const val = newTime.trim();
    if (!isValidPushTime(val) || pushTimes.includes(val)) return;
    if (atTimeLimit) return;
    setPushTimes((prev) => [...prev, val].sort());
  };

  const removeTime = (t: string) => {
    setPushTimes((prev) => prev.filter((x) => x !== t));
  };

  const handleSubscribe = async () => {
    if (!fixedSchedule && pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    if (endCondition === "REPEAT_N_TIMES" && (!Number.isFinite(repeatCount) || repeatCount < 1)) {
      toast.error("循环次数须为大于 0 的整数");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: id,
          ...(!fixedSchedule ? { pushTimes } : {}),
          mode,
          endCondition,
          repeatCount: endCondition === "REPEAT_N_TIMES" ? repeatCount : 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("订阅成功");
      setSubscribed(true);
      setSubCount((c) => c + 1);
      setOpen(false);
    } catch {
      toast.error("订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LearningCatalogCard
      href={`/bank/${id}`}
      title={title}
      description={description}
      creator={`${creator.name ?? "未知"}${creator.uid ? ` · ${creator.uid}` : ""}`}
      count={questionCount}
      countLabel="道题"
      subscribers={subCount}
      icon={BookOpenCheck}
      schedule={scheduleSummary}
      subscribed={subscribed}
      activity={accuracy !== null ? `${answererCount} 人答题 · ${answerCount} 次作答 · 正确率 ${accuracy}%` : undefined}
      action={isLoggedIn ? (
        <>
          {atSubLimit ? (
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              订阅数已满 {MAX_SUBSCRIPTIONS_PER_TARGET}/{MAX_SUBSCRIPTIONS_PER_TARGET}
            </Badge>
          ) : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="h-9 gap-1.5 px-3" />}>
                <Plus className="size-3.5" aria-hidden />
                订阅
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>订阅「{title}」</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <SubscriptionPolicyFields mode={mode} onModeChange={setMode} endCondition={endCondition} repeatCount={repeatCount}
                    onReviewChange={(end, count) => { setEndCondition(end); setRepeatCount(count); }} disabled={loading} />
                  {!fixedSchedule && <>
                    <div className="space-y-2">
                      <Label>选择每日推送时间</Label>
                      <p className="text-xs text-muted-foreground">
                        默认仅工作日推送（自动跳过周末与法定节假日），最多 {MAX_PUSH_TIMES_PER_SUBSCRIPTION} 个时间点
                      </p>
                      <div className="flex gap-2">
                        <Input
                          id={`push-time-${id}`}
                          aria-label="新增推送时间"
                          type="time"
                          value={newTime}
                          onChange={(e) => setNewTime(e.target.value)}
                          className="flex-1"
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
                      {atTimeLimit && (
                        <p className="text-xs text-amber-600">
                          已达上限 {MAX_PUSH_TIMES_PER_SUBSCRIPTION}/{MAX_PUSH_TIMES_PER_SUBSCRIPTION}
                        </p>
                      )}
                    </div>
                    {pushTimes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pushTimes.map((t) => (
                          <Badge
                            key={t}
                            render={<button type="button" aria-label={`移除 ${t} 推送时间`} />}
                            className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                            onClick={() => removeTime(t)}
                          >
                            <Clock className="size-3" />
                            {t}<X className="size-3" aria-hidden />
                          </Badge>
                        ))}
                      </div>
                    )}
                    {pushTimes.length === 0 && (
                      <p className="text-xs text-muted-foreground">点击「添加」设定推送时间，支持多个时间点</p>
                    )}
                  </>}
                  {fixedSchedule && <p className="text-sm text-muted-foreground">{scheduleSummary}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                    取消
                  </Button>
                  <Button onClick={handleSubscribe} disabled={loading}>
                    {loading ? "订阅中..." : "确认订阅"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      ) : <Button variant="ghost" className="h-9 px-2 text-primary" render={<Link href={`/bank/${id}`} />} nativeButton={false}>查看详情</Button>}
    />
  );
}
