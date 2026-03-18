"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

interface SubscriptionPanelProps {
  bankId: string;
  initialSubscription?: {
    id: string;
    pushTimes: string[];
    isActive: boolean;
  } | null;
  totalQuestions: number;
  pushedCount: number;
}

export function SubscriptionPanel({
  initialSubscription,
  totalQuestions,
  pushedCount,
}: SubscriptionPanelProps) {
  const router = useRouter();
  const [subscription, setSubscription] = useState(initialSubscription);
  const [pushTimes, setPushTimes] = useState<string[]>(
    initialSubscription?.pushTimes ?? []
  );
  const [newTime, setNewTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (!subscription) return null;

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

  const handleUpdate = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少保留一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTimes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "更新失败");
        return;
      }
      toast.success("推送时间已更新");
      setSubscription((prev) =>
        prev ? { ...prev, pushTimes: data.pushTimes } : prev
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
      setPushTimes([]);
      router.refresh();
    } catch {
      toast.error("取消订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="font-serif">我的订阅</CardTitle>
          <p className="text-sm text-muted-foreground">
            推送时间：{subscription.pushTimes.join("、")}
          </p>
          <p className="text-xs text-muted-foreground">
            默认仅工作日推送（自动跳过周末与法定节假日）
          </p>
          <p className="text-sm text-muted-foreground">
            进度：{pushedCount} / {totalQuestions} 题
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            取消订阅
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
