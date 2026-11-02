"use client";

import Link from "next/link";
import { useState } from "react";
import { BookMarked, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { isGroupId } from "@/lib/groups/identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LearningCatalogCard } from "@/components/ui/learning-catalog-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { SubscriptionPolicyFields } from "@/components/bank/subscription-policy-fields";
import type { LearningSubscriptionMode } from "@/types";

export interface KnowledgeCardProps {
  id: string;
  title: string;
  description?: string | null;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null; };
  pointCount: number;
  subscriberCount: number;
  recommendedSubscriptionMode?: LearningSubscriptionMode;
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  subscriptionCount?: number;
  targetType?: "USER" | "GROUP";
  targetId?: string;
  onSubscribed?: () => void;
}

export function KnowledgeCard({
  id,
  title,
  description,
  creator,
  pointCount,
  subscriberCount,
  recommendedSubscriptionMode = "FOLLOW_UPDATES",
  isLoggedIn = false,
  isSubscribed = false,
  subscriptionCount = 0,
  targetType = "USER",
  targetId,
  onSubscribed,
}: KnowledgeCardProps) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [subCount, setSubCount] = useState(subscriberCount);
  const [open, setOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>([
    ...DEFAULT_KNOWLEDGE_PUSH_TIMES,
  ]);
  const [mode, setMode] = useState(recommendedSubscriptionMode);
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
    if (targetType === "GROUP" && !isGroupId(targetId)) {
      toast.error("群号无效，请重新选择接收群");
      return;
    }
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId: id, pushTimes, targetType, targetId, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success(targetType === "GROUP" ? `已订阅到群 ${targetId}` : "订阅成功，将按设定时间推送知识卡片");
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
    <LearningCatalogCard
      href={`/knowledge/${id}`}
      title={title}
      description={description}
      creator={`${creator.name ?? "未知"}${creator.uid ? ` · ${creator.uid}` : ""}`}
      count={pointCount}
      countLabel="张知识卡"
      subscribers={subCount}
      icon={BookMarked}
      tone="teal"
      schedule="订阅时设置推送时间"
      subscribed={subscribed}
      action={isLoggedIn ? (
        <>
          {atSubLimit ? (
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              订阅数已满
            </Badge>
          ) : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button className="h-9 gap-1.5 px-3" />}>
                <Plus className="size-3.5" aria-hidden />
                {targetType === "GROUP" ? "订阅到群" : "订阅"}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>订阅「{title}」</DialogTitle>
                  {targetType === "GROUP" ? <DialogDescription className="break-all">接收群：{targetId}</DialogDescription> : null}
                </DialogHeader>
                <div className="space-y-4">
                  <SubscriptionPolicyFields mode={mode} onModeChange={setMode} disabled={loading} />
                  <div className="space-y-2">
                    <Label>每日推送时间</Label>
                    <p className="text-xs text-muted-foreground">
                      按顺序推送，后续是否接收新内容由订阅模式决定。
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
                        {time}<X className="size-3" aria-hidden />
                      </Badge>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                    取消
                  </Button>
                  <Button onClick={handleSubscribe} disabled={loading}>
                    {loading ? "订阅中..." : targetType === "GROUP" ? "确认订阅到群" : "确认订阅"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      ) : <Button variant="ghost" className="h-9 px-2 text-primary" render={<Link href={`/knowledge/${id}`} />} nativeButton={false}>查看详情</Button>}
    />
  );
}
