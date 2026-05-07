"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ComponentType } from "react";
import { Bell, FileText, Github, Newspaper, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DigestType } from "@/types";

interface DigestSubscription {
  id: string;
  digestType: DigestType;
  pushTimes: string[];
  isActive: boolean;
}

interface DigestOption {
  type: DigestType;
  title: string;
  description: string;
  defaultTime: string;
  icon: ComponentType<{ className?: string }>;
}

const DIGEST_OPTIONS: DigestOption[] = [
  {
    type: "GITHUB_TRENDING",
    title: "GitHub Trending",
    description: "每日趋势项目、star、语言和项目摘要。",
    defaultTime: "09:00",
    icon: Github,
  },
  {
    type: "AI_NEWS",
    title: "AI 新闻日报",
    description: "OpenAI、MIT News 与高热 AI 讨论聚合。",
    defaultTime: "09:20",
    icon: Newspaper,
  },
  {
    type: "ARXIV_AI_PAPERS",
    title: "arXiv AI 论文",
    description: "最新 AI 相关论文、作者、分类和摘要。",
    defaultTime: "09:40",
    icon: FileText,
  },
];

function getTime(sub?: DigestSubscription, option?: DigestOption): string {
  return sub?.pushTimes[0] ?? option?.defaultTime ?? "09:00";
}

export function DigestSubscriptionList() {
  const { status } = useSession();
  const [subscriptions, setSubscriptions] = useState<DigestSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<DigestType | null>(null);
  const [editingType, setEditingType] = useState<DigestType | null>(null);
  const [draftTimes, setDraftTimes] = useState<Record<DigestType, string>>({
    GITHUB_TRENDING: "09:00",
    AI_NEWS: "09:20",
    ARXIV_AI_PAPERS: "09:40",
  });

  const subscriptionByType = useMemo(() => {
    const map = new Map<DigestType, DigestSubscription>();
    for (const sub of subscriptions) {
      map.set(sub.digestType, sub);
    }
    return map;
  }, [subscriptions]);

  const refresh = async () => {
    const res = await fetch("/api/digest-subscriptions/mine");
    const data = await res.json();
    if (Array.isArray(data)) {
      setSubscriptions(data);
      setDraftTimes((prev) => {
        const next = { ...prev };
        for (const sub of data as DigestSubscription[]) {
          next[sub.digestType] = sub.pushTimes[0] ?? next[sub.digestType];
        }
        return next;
      });
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() => toast.error("摘要订阅加载失败"))
      .finally(() => setLoading(false));
  }, [status]);

  const subscribe = async (option: DigestOption) => {
    setSavingType(option.type);
    try {
      const res = await fetch("/api/digest-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digestType: option.type,
          pushTimes: [draftTimes[option.type] || option.defaultTime],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("已订阅每日摘要");
      await refresh();
    } catch {
      toast.error("订阅失败，请稍后再试");
    } finally {
      setSavingType(null);
    }
  };

  const updateTime = async (sub: DigestSubscription) => {
    setSavingType(sub.digestType);
    try {
      const res = await fetch(`/api/digest-subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTimes: [draftTimes[sub.digestType]] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "更新时间失败");
        return;
      }
      toast.success("推送时间已更新");
      setEditingType(null);
      await refresh();
    } catch {
      toast.error("更新时间失败，请稍后再试");
    } finally {
      setSavingType(null);
    }
  };

  const unsubscribe = async (sub: DigestSubscription) => {
    if (!confirm("确定取消这个每日摘要订阅吗？")) return;
    setSavingType(sub.digestType);
    try {
      const res = await fetch(`/api/digest-subscriptions/${sub.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "取消订阅失败");
        return;
      }
      toast.success("已取消订阅");
      await refresh();
    } catch {
      toast.error("取消订阅失败，请稍后再试");
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">每日摘要订阅</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="animate-pulse">
              <CardContent className="space-y-3 pt-6">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">每日摘要订阅</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            每种摘要每天只抓取一次，订阅用户按各自时间收到同一份缓存内容。
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Bell className="size-3" />
          每类每日一次
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {DIGEST_OPTIONS.map((option, index) => {
          const sub = subscriptionByType.get(option.type);
          const Icon = option.icon;
          const isSaving = savingType === option.type;
          const isEditing = editingType === option.type;

          return (
            <Card
              key={option.type}
              className="paper-rise card-hover"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <CardHeader className="gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="size-4" />
                </div>
                <CardTitle>{option.title}</CardTitle>
                <CardDescription>{option.description}</CardDescription>
                <CardAction>
                  {sub ? (
                    <Badge variant="secondary">已订阅</Badge>
                  ) : (
                    <Badge variant="outline">未订阅</Badge>
                  )}
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    每日推送时间
                  </label>
                  <Input
                    type="time"
                    value={draftTimes[option.type] || getTime(sub, option)}
                    disabled={Boolean(sub) && !isEditing}
                    onChange={(event) =>
                      setDraftTimes((prev) => ({
                        ...prev,
                        [option.type]: event.target.value,
                      }))
                    }
                  />
                </div>

                {status !== "authenticated" ? (
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    render={<Link href="/login?callbackUrl=/" />}
                    nativeButton={false}
                  >
                    登录后订阅
                  </Button>
                ) : sub ? (
                  <div className="flex gap-2">
                    {isEditing ? (
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => updateTime(sub)}
                        disabled={isSaving}
                      >
                        保存
                      </Button>
                    ) : (
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingType(option.type)}
                      >
                        <Pencil className="size-3.5" />
                        修改
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`取消订阅 ${option.title}`}
                      onClick={() => unsubscribe(sub)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => subscribe(option)}
                    disabled={isSaving}
                  >
                    订阅
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
