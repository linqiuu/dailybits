"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Users, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

export interface BankCardProps {
  id: string;
  title: string;
  description: string | null;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  questionCount: number;
  subscriberCount: number;
  answerCount?: number;
  correctAnswerCount?: number;
  answererCount?: number;
  subscriptionScheduleMode: SubscriptionScheduleMode;
  subscriptionCadence: SubscriptionCadence;
  subscriptionWeekdays: number[];
  subscriptionPushTimes: string[];
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  subscriptionCount?: number;
  appearDelayMs?: number;
  compact?: boolean;
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
  isLoggedIn = false,
  isSubscribed = false,
  subscriptionCount = 0,
  appearDelayMs = 0,
  compact = false,
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
  const [repeatCount, setRepeatCount] = useState(1);

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
    <Card
      size={compact ? "sm" : "default"}
      className={cn(
        "content-card paper-rise card-hover flex flex-col",
        compact ? "min-h-[156px]" : "min-h-[220px]",
      )}
      style={{ animationDelay: `${appearDelayMs}ms` }}
    >
      <CardHeader className={cn("min-w-0 pb-2", compact ? "gap-2" : "gap-3")}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link href={`/bank/${id}`} className="block min-w-0 hover:underline">
              <CardTitle
                className={cn("truncate font-semibold", compact ? "text-base group-data-[size=sm]/card:text-base" : "text-lg")}
                title={title}
              >
                {title}
              </CardTitle>
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              创建者：{creator.name ?? "未知"}
              {creator.uid ? ` (${creator.uid})` : ""}
            </p>
          </div>
          {subscribed ? (
            <Badge className="shrink-0 border-0 bg-success/10 text-success">
              已订阅
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className={cn("flex flex-1 flex-col justify-between", compact ? "gap-3" : "gap-4")}>
        <div className="space-y-3">
          <div className="content-metrics">
            <Stat label="题目" value={questionCount} />
            <Stat label="订阅" value={subCount} icon={Users} />
            <Stat label="答题人数" value={answererCount} icon={CheckCircle2} />
          </div>
          {accuracy !== null ? (
            <div className="label-chip">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {answerCount} 次答题，正确率 {accuracy}%
            </div>
          ) : null}
          <div className="label-chip min-w-0">
            <CalendarClock className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{scheduleSummary}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/bank/${id}`} />}
            nativeButton={false}
          >
            查看详情
          </Button>
          {isLoggedIn && !subscribed && (
            <>
              {atSubLimit ? (
                <Badge variant="secondary" className="text-xs text-muted-foreground">
                  订阅数已满 {MAX_SUBSCRIPTIONS_PER_TARGET}/{MAX_SUBSCRIPTIONS_PER_TARGET}
                </Badge>
              ) : fixedSchedule ? (
                <Button size="sm" onClick={handleSubscribe} disabled={loading}>
                  {loading ? "订阅中..." : "订阅"}
                </Button>
              ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground h-7 hover:bg-primary/80 transition-colors">
                    订阅
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>订阅「{title}」</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>结束条件</Label>
                        <Select
                          value={endCondition}
                          onValueChange={(v) =>
                            setEndCondition(v as "END_AFTER_COMPLETE" | "REPEAT_N_TIMES")
                          }
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
                        {endCondition === "REPEAT_N_TIMES" && (
                          <div className="space-y-1.5 pt-1">
                            <Label htmlFor={`repeat-${id}`}>循环次数</Label>
                            <Input
                              id={`repeat-${id}`}
                              type="number"
                              min={1}
                              step={1}
                              value={repeatCount}
                              onChange={(e) =>
                                setRepeatCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                              }
                            />
                          </div>
                        )}
                      </div>
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon?: typeof Users;
}) {
  return (
    <div className="content-stat">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}
