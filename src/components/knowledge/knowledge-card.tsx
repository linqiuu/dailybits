"use client";

import Link from "next/link";
import { useState } from "react";
import { BookMarked, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DEFAULT_KNOWLEDGE_PUSH_TIMES,
  MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
} from "@/types";
import { cn } from "@/lib/utils";

export interface KnowledgeCardProps {
  id: string;
  title: string;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  pointCount: number;
  subscriberCount: number;
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  subscriptionCount?: number;
  appearDelayMs?: number;
  targetType?: "USER" | "GROUP";
  targetId?: string;
  onSubscribed?: () => void;
  compact?: boolean;
}

export function KnowledgeCard({
  id,
  title,
  creator,
  pointCount,
  subscriberCount,
  isLoggedIn = false,
  isSubscribed = false,
  subscriptionCount = 0,
  appearDelayMs = 0,
  targetType = "USER",
  targetId,
  onSubscribed,
  compact = false,
}: KnowledgeCardProps) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [subCount, setSubCount] = useState(subscriberCount);
  const [open, setOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>([
    ...DEFAULT_KNOWLEDGE_PUSH_TIMES,
  ]);
  const [newTime, setNewTime] = useState(DEFAULT_KNOWLEDGE_PUSH_TIMES[0]);
  const [loading, setLoading] = useState(false);

  const atSubLimit = subscriptionCount >= MAX_KNOWLEDGE_SUBSCRIPTIONS_PER_TARGET;
  const atTimeLimit = pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;

  const addTime = () => {
    const val = newTime.trim();
    if (!val || !/^\d{2}:\d{2}$/.test(val)) {
      toast.error("请输入有效的 HH:MM 格式时间");
      return;
    }
    if (pushTimes.includes(val)) return;
    if (atTimeLimit) return;
    setPushTimes((prev) => [...prev, val].sort());
  };

  const handleSubscribe = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId: id, pushTimes, targetType, targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("订阅成功，将按设定时间推送知识卡片");
      setSubscribed(true);
      setSubCount((count) => count + 1);
      setOpen(false);
      onSubscribed?.();
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
        compact ? "min-h-[146px]" : "min-h-[200px]",
      )}
      style={{ animationDelay: `${appearDelayMs}ms` }}
    >
      <CardHeader className={cn("min-w-0 pb-2", compact ? "gap-2" : "gap-3")}>
        <Link href={`/knowledge/${id}`} className="block min-w-0 hover:underline">
          <CardTitle
            className={cn(
              "flex items-center gap-2 truncate font-semibold",
              compact ? "text-base" : "text-lg",
            )}
            title={title}
          >
            <BookMarked className="size-4 shrink-0 text-primary" />
            <span className="truncate">{title}</span>
          </CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            创建者：{creator.name ?? "未知"}
            {creator.uid ? ` (${creator.uid})` : ""}
          </p>
          <div className="content-metrics content-metrics-2">
            <div className="content-stat">
              <div className="text-xs text-muted-foreground">知识卡</div>
              <div className="mt-1 text-base font-semibold">{pointCount}</div>
            </div>
            <div className="content-stat">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden />
                订阅
              </div>
              <div className="mt-1 text-base font-semibold">{subCount}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/knowledge/${id}`} />}
            nativeButton={false}
          >
            查看详情
          </Button>
          {isLoggedIn && !subscribed && (
            <>
              {atSubLimit ? (
                <Badge variant="secondary" className="text-xs text-muted-foreground">
                  订阅数已满
                </Badge>
              ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger className="inline-flex h-7 shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
                    订阅
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>订阅「{title}」</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>每日推送时间</Label>
                        <p className="text-xs text-muted-foreground">
                          知识卡片会按顺序发送，推完后从头循环。
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
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pushTimes.map((time) => (
                          <Badge
                            key={time}
                            render={<button type="button" aria-label={`移除 ${time} 推送时间`} />}
                            className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                            onClick={() =>
                              setPushTimes((prev) => prev.filter((item) => item !== time))
                            }
                          >
                            {time} ×
                          </Badge>
                        ))}
                      </div>
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
          {subscribed && <Badge className="border-0 bg-success/10 text-success">已订阅</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
