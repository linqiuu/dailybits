"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { learningModeLabels, learningStatusLabels } from "@/lib/subscriptions/policy";
import type { LearningSubscriptionMode, LearningSubscriptionStatus } from "@/types";
import { RequestState } from "@/components/ui/request-state";

interface SubscriptionItem {
  id: string;
  bankId: string;
  mode: LearningSubscriptionMode;
  status: LearningSubscriptionStatus;
  pushTimes: string[];
  effectivePushTimes?: string[];
  isActive: boolean;
  bank: {
    id: string;
    title: string;
    subscriptionScheduleMode?: "CUSTOM" | "FIXED";
    subscriptionCadence?: "DAILY" | "WEEKLY";
    subscriptionWeekdays?: number[];
    subscriptionPushTimes?: string[];
  };
  questionCount: number;
  pushedCount: number;
}

export function SubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
    const res = await fetch("/api/subscriptions/mine");
    if (!res.ok) throw new Error("Unavailable");
    const data = await res.json();
    if (Array.isArray(data)) {
      setSubscriptions(data);
    } else throw new Error("Invalid response");
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh()
        .catch(() => toast.error("订阅列表加载失败"))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const unsubscribe = async (sub: SubscriptionItem) => {
    if (!confirm(`确定取消订阅「${sub.bank.title}」吗？`)) return;
    setCancellingId(sub.id);
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "取消订阅失败");
        return;
      }
      toast.success("已取消订阅");
      setSubscriptions((prev) => prev.filter((item) => item.id !== sub.id));
    } catch {
      toast.error("取消订阅失败，请稍后再试");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="panel-title text-lg">我的订阅</h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-5 w-48 rounded bg-muted" />
                <div className="mt-2 h-4 w-full rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (failed) return <RequestState title="题库订阅暂时加载失败" onRetry={() => void refresh()} />;
  if (subscriptions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="panel-title text-lg">我的订阅</h2>
        <EmptyState
          title="书房空空如也"
          description="去探索一些有趣的题库，挑几本加入你的每日书单吧。"
          illustration="book"
          action={{ label: "去发现题库", href: "/" }}
          variant="compact"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="panel-title text-lg">我的订阅</h2>
      <div className="space-y-3">
        {subscriptions.map((sub, index) => {
          const total = sub.questionCount;
          const pushed = sub.pushedCount;
          const pct = total > 0 ? Math.min(100, (pushed / total) * 100) : 0;
          const displayTimes = sub.effectivePushTimes?.length
            ? sub.effectivePushTimes
            : sub.pushTimes;
          const fixed = sub.bank.subscriptionScheduleMode === "FIXED";

          return (
            <Card
              key={sub.id}
              className="content-card paper-rise card-hover"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-2">
                  <CardTitle className="text-base font-semibold">
                    {sub.bank.title}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{learningStatusLabels[sub.status]}</Badge><Badge variant="outline">{learningModeLabels[sub.mode]}</Badge>
                    {displayTimes.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                    {fixed ? <Badge variant="outline">创建者固定</Badge> : null}
                  </div>
                  <div className="space-y-1">
                    <div className="progress-gauge h-1.5 w-full">
                      <span
                        className="transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pushed} / {total} 题
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/bank/${sub.bankId}`} />}
                    nativeButton={false}
                  >
                    {sub.status === "COMPLETED" ? "查看详情" : "管理订阅"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => unsubscribe(sub)}
                    disabled={cancellingId === sub.id || sub.status === "COMPLETED"}
                  >
                    <Trash2 className="size-3.5" />
                    取消订阅
                  </Button>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
