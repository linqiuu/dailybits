"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { X } from "lucide-react";
import { isValidPushTime } from "@/lib/subscriptions/schedule";
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
import { WorkbenchPanel } from "@/components/ui/workbench";
import { startLogin } from "@/lib/client-auth";
import { paginateKnowledgePoints } from "@/lib/knowledge/pagination";
import { DEFAULT_KNOWLEDGE_PUSH_TIMES, MAX_PUSH_TIMES_PER_SUBSCRIPTION } from "@/types";

const KNOWLEDGE_POINTS_PER_PAGE = 20;

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
  const [newTime, setNewTime] = useState(DEFAULT_KNOWLEDGE_PUSH_TIMES[0]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pointPage, setPointPage] = useState(1);
  const paginatedPoints = paginateKnowledgePoints(
    bank.points,
    pointPage,
    KNOWLEDGE_POINTS_PER_PAGE,
  );

  const addTime = () => {
    const val = newTime.trim();
    if (!isValidPushTime(val)) {
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
      const editing = !!subscription?.id && subscribed;
      const res = await fetch(
        editing
          ? `/api/knowledge-subscriptions/${subscription.id}`
          : "/api/knowledge-subscriptions",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankId: bank.id, pushTimes }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success(editing ? "推送时间已更新" : "订阅成功");
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
      <WorkbenchPanel className="editor-hero" padded={false}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-0">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{bank.title}</h1>
            {bank.description ? (
              <p className="text-sm text-muted-foreground">{bank.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              创建者：{bank.creator.name ?? "未知"}
              {bank.creator.uid ? ` (${bank.creator.uid})` : ""}，{bank.pointCount} 条，{" "}
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
      </WorkbenchPanel>

      <section className="border-y py-4">
        <CardHeader className="px-0">
          <CardTitle className="text-lg font-semibold">每日知识卡片推送</CardTitle>
        </CardHeader>
        <CardContent className="mt-3 flex flex-wrap items-center justify-between gap-3 px-0">
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
                    <DialogTitle>
                      {subscribed ? "编辑推送时间" : `订阅「${bank.title}」`}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>每日推送时间</Label>
                      <div className="flex gap-2">
                        <Input
                          aria-label="新增知识卡片推送时间"
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
              <Button onClick={startLogin}>
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
      </section>

      <section>
        <CardHeader className="px-0">
          <h2 className="text-lg font-semibold">
            知识卡片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              共 {bank.pointCount} 条
            </span>
          </h2>
        </CardHeader>
        <CardContent className="mt-4 space-y-3 px-0">
          {bank.points.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无知识卡片，创建者添加后即可推送
            </p>
          ) : (
            <>
              {paginatedPoints.items.map((point) => (
                <article key={point.id} className="max-w-4xl border-b py-4 last:border-0">
                  <p className="mb-2 text-xs text-muted-foreground">#{point.displayIndex}</p>
                  <MarkdownContent>{point.content}</MarkdownContent>
                </article>
              ))}
              {paginatedPoints.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    第 {paginatedPoints.page} / {paginatedPoints.totalPages} 页
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPointPage((page) => Math.max(1, page - 1))}
                      disabled={paginatedPoints.page <= 1}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPointPage((page) =>
                          Math.min(paginatedPoints.totalPages, page + 1),
                        )
                      }
                      disabled={paginatedPoints.page >= paginatedPoints.totalPages}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </section>
    </div>
  );
}
