"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BankSelector } from "./bank-selector";
import {
  MAX_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
} from "@/types";

interface SubscriptionItem {
  id: string;
  bankId: string;
  pushTimes: string[];
  isActive: boolean;
  bank: {
    id: string;
    title: string;
    description: string | null;
    subscriberCount: number;
    _count: { questions: number };
  };
  questionCount: number;
  pushedCount: number;
}

interface GroupSubscriptionsResponse {
  subscriptions: SubscriptionItem[];
  count: number;
  limit: number;
}

export function GroupDashboard({ groupId }: { groupId: string }) {
  const [data, setData] = useState<GroupSubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchSubscriptions = useCallback(() => {
    setLoading(true);
    fetch(`/api/group/${groupId}/subscriptions`)
      .then((res) => res.json())
      .then((json) => {
        if (json && Array.isArray(json.subscriptions)) {
          setData(json as GroupSubscriptionsResponse);
        } else {
          setData({ subscriptions: [], count: 0, limit: MAX_SUBSCRIPTIONS_PER_TARGET });
        }
      })
      .catch(() => {
        toast.error("获取订阅列表失败");
        setData({ subscriptions: [], count: 0, limit: MAX_SUBSCRIPTIONS_PER_TARGET });
      })
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleUnsubscribe = async (subId: string) => {
    if (!confirm("确定要取消该订阅吗？")) return;
    try {
      const res = await fetch(
        `/api/group/${groupId}/subscriptions/${subId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "取消订阅失败");
        return;
      }
      toast.success("已取消订阅");
      fetchSubscriptions();
    } catch {
      toast.error("取消订阅失败");
    }
  };

  const atLimit = (data?.count ?? 0) >= MAX_SUBSCRIPTIONS_PER_TARGET;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-5 w-48 rounded bg-muted" />
              <div className="mt-2 h-4 w-full rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          已订阅 {data?.count ?? 0} / {MAX_SUBSCRIPTIONS_PER_TARGET} 个题库
        </p>
        {atLimit ? (
          <Badge variant="secondary" className="text-xs text-muted-foreground">
            订阅数已满 {MAX_SUBSCRIPTIONS_PER_TARGET}/{MAX_SUBSCRIPTIONS_PER_TARGET}
          </Badge>
        ) : (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground h-8 hover:bg-primary/80 transition-colors">
            添加订阅
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif">添加题库订阅</DialogTitle>
            </DialogHeader>
            <BankSelector
              groupId={groupId}
              onSuccess={() => {
                setAddOpen(false);
                fetchSubscriptions();
              }}
            />
          </DialogContent>
        </Dialog>
        )}
      </div>

      {data?.subscriptions.length === 0 ? (
        <EmptyState
          title="暂无订阅"
          description="点击「添加订阅」为该群组订阅题库"
          illustration="book"
        />
      ) : (
        <div className="space-y-3">
          {data?.subscriptions.map((sub, index) => (
            <GroupSubscriptionCard
              key={sub.id}
              sub={sub}
              groupId={groupId}
              index={index}
              onUnsubscribe={() => handleUnsubscribe(sub.id)}
              onUpdate={fetchSubscriptions}
            />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          群组 ID: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{groupId}</code>
        </p>
      </div>
    </div>
  );
}

function GroupSubscriptionCard({
  sub,
  groupId,
  index,
  onUnsubscribe,
  onUpdate,
}: {
  sub: SubscriptionItem;
  groupId: string;
  index: number;
  onUnsubscribe: () => void;
  onUpdate: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>(sub.pushTimes);
  const [newTime, setNewTime] = useState("");
  const [saving, setSaving] = useState(false);

  const total = sub.questionCount;
  const pushed = sub.pushedCount;
  const pct = total > 0 ? Math.min(100, (pushed / total) * 100) : 0;
  const atTimeLimit = pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;

  const addTime = () => {
    const val = newTime.trim();
    if (!val || !/^\d{2}:\d{2}$/.test(val)) {
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
    setPushTimes((prev) => [...prev, val].sort());
    setNewTime("");
  };

  const removeTime = (t: string) => {
    setPushTimes((prev) => prev.filter((x) => x !== t));
  };

  const handleSave = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少保留一个推送时间");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/group/${groupId}/subscriptions/${sub.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pushTimes }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "更新失败");
        return;
      }
      toast.success("推送时间已更新");
      setEditOpen(false);
      onUpdate();
    } catch {
      toast.error("更新失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className="paper-rise card-hover"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <CardTitle className="font-serif text-base">
            {sub.bank.title}
          </CardTitle>
          {sub.bank.description && (
            <p className="truncate text-xs text-muted-foreground">
              {sub.bank.description}
            </p>
          )}
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
              {pushed} / {total} 题 · {sub.bank.subscriberCount} 人订阅
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium h-7 hover:bg-muted transition-colors">
              编辑时间
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑推送时间</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
                <div className="flex flex-wrap gap-2">
                  {pushTimes.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTime(t)}
                    >
                      {t} ×
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="destructive"
            size="sm"
            onClick={onUnsubscribe}
          >
            取消订阅
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
