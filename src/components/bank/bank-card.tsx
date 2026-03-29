"use client";

import Link from "next/link";
import { useState } from "react";
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
} from "@/types";

export interface BankCardProps {
  id: string;
  title: string;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  questionCount: number;
  subscriberCount: number;
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  subscriptionCount?: number;
  appearDelayMs?: number;
}

export function BankCard({
  id,
  title,
  creator,
  questionCount,
  subscriberCount,
  isLoggedIn = false,
  isSubscribed = false,
  subscriptionCount = 0,
  appearDelayMs = 0,
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

  const addTime = () => {
    const val = newTime.trim();
    if (!val || pushTimes.includes(val)) return;
    if (atTimeLimit) return;
    setPushTimes((prev) => [...prev, val].sort());
  };

  const removeTime = (t: string) => {
    setPushTimes((prev) => prev.filter((x) => x !== t));
  };

  const handleSubscribe = async () => {
    if (pushTimes.length === 0) {
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
          pushTimes,
          endCondition,
          repeatCount: endCondition === "REPEAT_N_TIMES" ? repeatCount : 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("订阅成功！将按设定时间推送题目");
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
      className="paper-rise card-hover flex flex-col"
      style={{ animationDelay: `${appearDelayMs}ms` }}
    >
      <CardHeader className="pb-2">
        <Link href={`/bank/${id}`} className="hover:underline">
          <CardTitle className="font-serif text-lg">{title}</CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            创建者：{creator.name ?? "未知"}
            {creator.uid ? ` (${creator.uid})` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {questionCount} 题 · {subCount} 人订阅过
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground h-7 hover:bg-primary/80 transition-colors">
                    订阅
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-serif">订阅「{title}」</DialogTitle>
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
                            <SelectValue />
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
                              className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                              onClick={() => removeTime(t)}
                            >
                              {t} ×
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
          {subscribed && (
            <Badge className="bg-success/10 text-success border-0">已订阅</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
