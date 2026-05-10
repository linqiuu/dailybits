"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface KnowledgeSubscriptionItem {
  id: string;
  bankId: string;
  pushTimes: string[];
  bank: { id: string; title: string };
  pointCount: number;
  pushedCount: number;
}

export function KnowledgeSubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<KnowledgeSubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/knowledge-subscriptions/mine");
    const data = await res.json();
    if (Array.isArray(data)) {
      setSubscriptions(data);
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => toast.error("知识卡片订阅加载失败"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const unsubscribe = async (sub: KnowledgeSubscriptionItem) => {
    if (!confirm(`确定取消订阅「${sub.bank.title}」吗？`)) return;
    setCancellingId(sub.id);
    try {
      const res = await fetch(`/api/knowledge-subscriptions/${sub.id}`, {
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
        <h2 className="font-serif text-xl font-semibold">知识卡片订阅</h2>
        <Card className="animate-pulse">
          <CardContent className="pt-6">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="mt-2 h-4 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">知识卡片订阅</h2>
        <EmptyState
          title="还没有知识卡片订阅"
          description="订阅一个知识库，每天收到一张 Markdown 知识卡。"
          illustration="book"
          action={{ label: "去发现知识卡片", href: "/" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">知识卡片订阅</h2>
      <div className="space-y-3">
        {subscriptions.map((sub, index) => (
          <Card
            key={sub.id}
            className="paper-rise card-hover"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle className="font-serif text-base">{sub.bank.title}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  {sub.pushTimes.map((time) => (
                    <Badge key={time} variant="secondary">
                      {time}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {sub.pushedCount} 次推送 · {sub.pointCount} 张知识卡
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/knowledge/${sub.bankId}`} />}
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
        ))}
      </div>
    </div>
  );
}
