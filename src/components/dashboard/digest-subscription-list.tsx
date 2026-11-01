"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startLogin, useSession } from "@/lib/client-auth";
import type { ComponentType } from "react";
import {
  CalendarClock,
  Check,
  FileText,
  Github,
  Newspaper,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidPushTime } from "@/lib/subscriptions/schedule";
import { RequestState } from "@/components/ui/request-state";
import { SUBSCRIBABLE_DIGEST_TYPES } from "@/lib/digest/options";
import {
  DIGEST_TYPES,
  type DigestSubscriptionCounts,
} from "@/lib/digest/subscription-counts";
import type { DigestType, TargetType } from "@/types";

interface DigestSubscription {
  id: string;
  digestType: DigestType;
  pushTimes: string[];
  isActive: boolean;
}

interface DigestSubscriptionListProps {
  targetType?: TargetType;
  targetId?: string;
  title?: string;
  description?: string;
}

interface DigestOption {
  type: DigestType;
  title: string;
  description: string;
  defaultTime: string;
  icon: ComponentType<{ className?: string; }>;
}

const ALL_DIGEST_OPTIONS: DigestOption[] = [
  {
    type: "GITHUB_TRENDING",
    title: "GitHub Trending",
    description: "每日趋势项目、star 增长和项目摘要。",
    defaultTime: "09:00",
    icon: Github,
  },
  {
    type: "AI_NEWS",
    title: "AI 新闻日报",
    description: "AIHOT 每日精选，覆盖模型、研究与产品动态。",
    defaultTime: "09:20",
    icon: Newspaper,
  },
  {
    type: "ARXIV_AI_PAPERS",
    title: "arXiv AI 论文",
    description: "最新 AI 相关论文、发布时间和摘要。",
    defaultTime: "09:40",
    icon: FileText,
  },
];

const SUBSCRIBABLE_DIGEST_TYPE_SET = new Set<DigestType>(SUBSCRIBABLE_DIGEST_TYPES);
const DIGEST_OPTIONS = ALL_DIGEST_OPTIONS.filter((option) =>
  SUBSCRIBABLE_DIGEST_TYPE_SET.has(option.type),
);

const DEFAULT_SUBSCRIBER_COUNTS = Object.fromEntries(
  DIGEST_TYPES.map((digestType) => [digestType, 0]),
) as DigestSubscriptionCounts;

function getTime(sub?: DigestSubscription, option?: DigestOption): string {
  return sub?.pushTimes[0] ?? option?.defaultTime ?? "09:00";
}

function parseSubscriberCounts(value: unknown): DigestSubscriptionCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const counts = (value as { subscriberCounts?: unknown; }).subscriberCounts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null;

  return Object.fromEntries(
    DIGEST_TYPES.map((digestType) => {
      const raw = (counts as Partial<Record<DigestType, unknown>>)[digestType];
      return [digestType, typeof raw === "number" && Number.isFinite(raw) ? raw : 0];
    }),
  ) as DigestSubscriptionCounts;
}

export function DigestSubscriptionList({
  targetType = "USER",
  targetId,
  title = "每日精选",
  description,
}: DigestSubscriptionListProps = {}) {
  const { status } = useSession();
  const [subscriptions, setSubscriptions] = useState<DigestSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [savingType, setSavingType] = useState<DigestType | null>(null);
  const [editingType, setEditingType] = useState<DigestType | null>(null);
  const actionRefs = useRef<Partial<Record<DigestType, HTMLButtonElement | null>>>({});
  const returnFocusTo = useRef<DigestType | null>(null);
  const [subscriberCounts, setSubscriberCounts] = useState<DigestSubscriptionCounts>(
    DEFAULT_SUBSCRIBER_COUNTS,
  );
  const [countsAvailable, setCountsAvailable] = useState(false);
  const [draftTimes, setDraftTimes] = useState<Record<DigestType, string>>({
    GITHUB_TRENDING: "09:00",
    AI_NEWS: "09:20",
    ARXIV_AI_PAPERS: "09:40",
  });

  useEffect(() => {
    if (editingType) {
      returnFocusTo.current = editingType;
    } else if (!savingType && returnFocusTo.current) {
      actionRefs.current[returnFocusTo.current]?.focus();
      returnFocusTo.current = null;
    }
  }, [editingType, savingType]);

  const subscriptionByType = useMemo(() => {
    const map = new Map<DigestType, DigestSubscription>();
    for (const sub of subscriptions) {
      map.set(sub.digestType, sub);
    }
    return map;
  }, [subscriptions]);

  const isGroupTarget = targetType === "GROUP";
  const collectionEndpoint =
    isGroupTarget && targetId
      ? `/api/group/${targetId}/digest-subscriptions`
      : "/api/digest-subscriptions/mine";
  const createEndpoint =
    isGroupTarget && targetId
      ? `/api/group/${targetId}/digest-subscriptions`
      : "/api/digest-subscriptions";
  const itemEndpoint = (id: string) =>
    isGroupTarget && targetId
      ? `/api/group/${targetId}/digest-subscriptions/${id}`
      : `/api/digest-subscriptions/${id}`;

  const refresh = useCallback(async () => {
    setFailed(false);
    const res = await fetch(collectionEndpoint);
    if (!res.ok) { setFailed(true); throw new Error("Unavailable"); }
    const data = await res.json();
    const counts = parseSubscriberCounts(data);
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.subscriptions)
        ? data.subscriptions
        : null;
    if (counts) {
      setSubscriberCounts(counts);
      setCountsAvailable(true);
    }
    if (items) {
      setSubscriptions(items);
      setDraftTimes((prev) => {
        const next = { ...prev };
        for (const sub of items as DigestSubscription[]) {
          next[sub.digestType] = sub.pushTimes[0] ?? next[sub.digestType];
        }
        return next;
      });
    } else { setFailed(true); throw new Error("Invalid response"); }
  }, [collectionEndpoint]);

  useEffect(() => {
    if (status === "loading") return;
    const timer = window.setTimeout(() => {
      if (targetType === "USER" && status === "unauthenticated") {
        fetch("/api/digest-subscriptions")
          .then((res) => res.json())
          .then((data) => {
            const counts = parseSubscriberCounts(data);
            if (counts) { setSubscriberCounts(counts); setCountsAvailable(true); }
          })
          .catch(() => undefined)
          .finally(() => setLoading(false));
        return;
      }
      refresh()
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [status, refresh, targetType]);

  const subscribe = async (option: DigestOption, pushTime: string) => {
    if (!isValidPushTime(pushTime)) {
      toast.error("请选择有效的推送时间");
      return;
    }
    setSavingType(option.type);
    try {
      const res = await fetch(createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digestType: option.type,
          pushTimes: [pushTime],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("已订阅每日摘要");
      await refresh();
      setEditingType(null);
    } catch {
      toast.error("订阅失败，请稍后再试");
    } finally {
      setSavingType(null);
    }
  };

  const updateTime = async (sub: DigestSubscription, pushTime: string) => {
    if (!isValidPushTime(pushTime)) {
      toast.error("请选择有效的推送时间");
      return;
    }
    setSavingType(sub.digestType);
    try {
      const res = await fetch(itemEndpoint(sub.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushTimes: [pushTime] }),
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
      const res = await fetch(itemEndpoint(sub.id), {
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

  if (failed) return <RequestState title="摘要订阅暂时加载失败" onRetry={() => void refresh().catch(() => setFailed(true))} />;
  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="panel-title text-lg">{title}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {DIGEST_OPTIONS.map((option) => (
            <Card key={option.type} className="animate-pulse">
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
          <h2 className="panel-title text-lg">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DIGEST_OPTIONS.map((option) => {
          const sub = subscriptionByType.get(option.type);
          const Icon = option.icon;
          const isSaving = savingType === option.type;
          const isEditing = editingType === option.type;

          return (
            <Card
              key={option.type}
              className="digest-card"
            >
              <CardHeader className="gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="digest-mark" data-kind={option.type}><Icon className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                      {option.title}
                      {countsAvailable ? <Badge
                        variant="outline"
                        className="gap-1 border-primary/20 bg-primary/5 text-primary"
                        aria-label={`${option.title} ${subscriberCounts[option.type]} 人已订阅`}
                      >
                        <Users className="size-3" />
                        {subscriberCounts[option.type]} 人已订阅
                      </Badge> : null}
                    </CardTitle>
                  </div>
                </div>
                <CardDescription>{option.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEditing ? (
                  <form className="digest-editor" onSubmit={(event) => {
                    event.preventDefault();
                    const pushTime = String(new FormData(event.currentTarget).get("pushTime") ?? "");
                    void (sub ? updateTime(sub, pushTime) : subscribe(option, pushTime));
                  }} aria-label={`${option.title}推送设置`}>
                    <div className="space-y-2">
                      <Label htmlFor={`digest-time-${targetType}-${targetId ?? "self"}-${option.type}`}>每日推送时间</Label>
                      <Input id={`digest-time-${targetType}-${targetId ?? "self"}-${option.type}`} className="h-9 w-36" name="pushTime" type="time" required autoFocus
                        value={draftTimes[option.type]} disabled={isSaving}
                        onChange={(event) => setDraftTimes((prev) => ({ ...prev, [option.type]: event.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" className="h-9" disabled={isSaving} onClick={() => {
                        setEditingType(null);
                        setDraftTimes((prev) => ({ ...prev, [option.type]: getTime(sub, option) }));
                      }}>取消</Button>
                      <Button type="submit" className="h-9" disabled={isSaving}>{isSaving ? "保存中…" : sub ? "保存" : "确认订阅"}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="digest-footer">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {sub ? <><Check className="size-3.5 text-success" aria-hidden /><span>已订阅 · {getTime(sub, option)}</span></> : <><CalendarClock className="size-3.5" aria-hidden /><span>每天更新 · 时间自选</span></>}
                    </div>
                    {status !== "authenticated" ? <Button className="h-9" variant="outline" onClick={startLogin}>登录后订阅</Button> : sub ? (
                      <div className="flex gap-1">
                        <Button ref={(node) => { actionRefs.current[option.type] = node; }} variant="ghost" className="h-9 text-muted-foreground" onClick={() => setEditingType(option.type)} disabled={savingType !== null}><Pencil className="size-3.5" aria-hidden />修改时间</Button>
                        <Button variant="ghost" className="size-9 text-muted-foreground hover:text-destructive" size="icon" title={`取消订阅 ${option.title}`} aria-label={`取消订阅 ${option.title}`} onClick={() => unsubscribe(sub)} disabled={savingType !== null}><Trash2 className="size-3.5" aria-hidden /></Button>
                      </div>
                    ) : <Button ref={(node) => { actionRefs.current[option.type] = node; }} className="h-9 px-3" onClick={() => setEditingType(option.type)} disabled={savingType !== null}><Plus className="size-3.5" aria-hidden />订阅</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
