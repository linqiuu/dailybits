"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface SubscriptionItem {
  id: string;
  bankId: string;
  pushTimes: string[];
  isActive: boolean;
  bank: { id: string; title: string };
  questionCount: number;
  pushedCount: number;
}

export function SubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/subscriptions/mine");
    const data = await res.json();
    if (Array.isArray(data)) {
      setSubscriptions(data);
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => toast.error("订阅列表加载失败"))
      .finally(() => setLoading(false));
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
        <h2 className="font-serif text-xl font-semibold">我的订阅</h2>
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

  if (subscriptions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">我的订阅</h2>
        <EmptyState
          title="书房空空如也"
          description="去探索一些有趣的题库，挑几本加入你的每日书单吧。"
          illustration="book"
          action={{ label: "去发现题库", href: "/" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">我的订阅</h2>
      <div className="space-y-3">
        {subscriptions.map((sub, index) => {
          const total = sub.questionCount;
          const pushed = sub.pushedCount;
          const pct = total > 0 ? Math.min(100, (pushed / total) * 100) : 0;

          return (
            <Card
              key={sub.id}
              className="paper-rise card-hover"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-2">
                  <CardTitle className="font-serif text-base">
                    {sub.bank.title}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {sub.pushTimes.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
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
                    编辑时间
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => unsubscribe(sub)}
                    disabled={cancellingId === sub.id}
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
