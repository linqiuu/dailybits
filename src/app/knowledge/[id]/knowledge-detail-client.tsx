"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { DEFAULT_KNOWLEDGE_PUSH_TIMES, MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

interface KnowledgeDetailClientProps {
  bank: {
    id: string;
    title: string;
    description: string | null;
    creatorId: string;
    subscriberCount: number;
    creator: { id: string; name: string | null; image: string | null; uid?: string | null };
    points: Array<{ id: string; content: string }>;
    pointCount: number;
  };
  isCreator: boolean;
  isLoggedIn: boolean;
  subscription: { id: string; pushTimes: string[]; isActive: boolean } | null;
}

export function KnowledgeDetailClient({
  bank,
  isCreator,
  isLoggedIn,
  subscription,
}: KnowledgeDetailClientProps) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(!!subscription?.isActive);
  const [pushTimes, setPushTimes] = useState<string[]>(
    subscription?.pushTimes?.length ? subscription.pushTimes : [...DEFAULT_KNOWLEDGE_PUSH_TIMES],
  );
  const [newTime, setNewTime] = useState("09:00");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const addTime = () => {
    const val = newTime.trim();
    if (!/^\d{2}:\d{2}$/.test(val)) {
      toast.error("请输入有效的 HH:MM 格式时间");
      return;
    }
    if (pushTimes.includes(val)) return;
    if (pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION) return;
    setPushTimes((prev) => [...prev, val].sort());
  };

  const saveSubscription = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        subscription?.id
          ? `/api/knowledge-subscriptions/${subscription.id}`
          : "/api/knowledge-subscriptions",
        {
          method: subscription?.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankId: bank.id, pushTimes }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success(subscription?.id ? "推送时间已更新" : "订阅成功");
      setSubscribed(true);
      setDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!subscription?.id) return;
    if (!confirm(`确定取消订阅「${bank.title}」吗？`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge-subscriptions/${subscription.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "取消订阅失败");
        return;
      }
      toast.success("已取消订阅");
      setSubscribed(false);
      router.refresh();
    } catch {
      toast.error("取消订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const deleteBank = async () => {
    if (!confirm("确定要删除此知识库吗？此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/knowledge-banks/${bank.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("删除失败，请稍后重试");
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="font-serif text-2xl">{bank.title}</CardTitle>
            {bank.description ? (
              <p className="text-sm text-muted-foreground">{bank.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              创建者：{bank.creator.name ?? "未知"}
              {bank.creator.uid ? ` (${bank.creator.uid})` : ""} · {bank.pointCount} 条 ·{" "}
              {bank.subscriberCount} 人订阅过
            </p>
          </div>
          {isCreator ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/knowledge/${bank.id}/edit`} />}
                nativeButton={false}
              >
                编辑
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteBank}>
                删除
              </Button>
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="font-serif text-lg">每日知识卡片推送</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              每次推送一张 Markdown 知识卡片，按顺序发送，推完后从头循环。
            </p>
            {subscribed ? (
              <div className="flex flex-wrap gap-1.5">
                {pushTimes.map((time) => (
                  <Badge key={time} variant="secondary">
                    {time}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {isLoggedIn ? (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
                  {subscribed ? "编辑时间" : "订阅"}
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-serif">
                      {subscribed ? "编辑推送时间" : `订阅「${bank.title}」`}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>每日推送时间</Label>
                      <div className="flex gap-2">
                        <Input
                          type="time"
                          value={newTime}
                          onChange={(event) => setNewTime(event.target.value)}
                          className="flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={addTime}>
                          添加
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pushTimes.map((time) => (
                        <Badge
                          key={time}
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
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={saveSubscription} disabled={loading}>
                      保存
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Button render={<Link href="/login" />} nativeButton={false}>
                登录后订阅
              </Button>
            )}
            {subscribed && subscription?.id ? (
              <Button variant="outline" onClick={unsubscribe} disabled={loading}>
                取消订阅
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">
            知识卡片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              共 {bank.points.length} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bank.points.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无知识卡片，创建者添加后即可推送
            </p>
          ) : (
            bank.points.slice(0, 20).map((point, index) => (
              <div key={point.id} className="rounded-lg border bg-card/80 p-3">
                <p className="mb-2 text-xs text-muted-foreground">#{index + 1}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {point.content}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
