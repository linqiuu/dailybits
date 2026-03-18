"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { Search, Clock, BookOpen, Users, CheckCircle } from "lucide-react";
import {
  MAX_SUBSCRIPTIONS_PER_TARGET,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
  DEFAULT_PUSH_TIMES,
} from "@/types";

/* ---------- types ---------- */

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

interface Bank {
  id: string;
  title: string;
  description: string | null;
  subscriberCount: number;
  creator: { id: string; name: string | null; image: string | null };
  _count: { questions: number };
  isSubscribed?: boolean;
}

interface BanksResponse {
  banks: Bank[];
  total: number;
  page: number;
  totalPages: number;
  subscriptionCount?: number;
}

/* ========== main component ========== */

export function GroupDashboard({ groupId }: { groupId: string }) {
  const [subData, setSubData] = useState<GroupSubscriptionsResponse | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  const [banksData, setBanksData] = useState<BanksResponse | null>(null);
  const [banksLoading, setBanksLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const fetchIdRef = useRef(0);

  /* --- subscriptions --- */
  const fetchSubscriptions = useCallback(() => {
    setSubLoading(true);
    fetch(`/api/group/${groupId}/subscriptions`)
      .then((res) => res.json())
      .then((json) => {
        if (json && Array.isArray(json.subscriptions)) {
          setSubData(json as GroupSubscriptionsResponse);
        } else {
          setSubData({ subscriptions: [], count: 0, limit: MAX_SUBSCRIPTIONS_PER_TARGET });
        }
      })
      .catch(() => {
        toast.error("获取订阅列表失败");
        setSubData({ subscriptions: [], count: 0, limit: MAX_SUBSCRIPTIONS_PER_TARGET });
      })
      .finally(() => setSubLoading(false));
  }, [groupId]);

  /* --- banks --- */
  useEffect(() => {
    if (search === debouncedSearch) return;
    setBanksLoading(true);
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

  const fetchBanks = useCallback(() => {
    const id = ++fetchIdRef.current;
    setBanksLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("targetType", "GROUP");
    params.set("targetId", groupId);
    fetch(`/api/banks?${params}`)
      .then((res) => res.json())
      .then((json: BanksResponse | { error: string }) => {
        if (id !== fetchIdRef.current) return;
        if ("banks" in json) {
          setBanksData(json);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) setBanksData(null);
      })
      .finally(() => {
        if (id === fetchIdRef.current) setBanksLoading(false);
      });
  }, [debouncedSearch, page, groupId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const refreshAll = () => {
    fetchSubscriptions();
    fetchBanks();
  };

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
      refreshAll();
    } catch {
      toast.error("取消订阅失败");
    }
  };

  const atLimit = (subData?.count ?? 0) >= MAX_SUBSCRIPTIONS_PER_TARGET;
  const subCount = subData?.count ?? 0;

  return (
    <div className="space-y-5">
      {/* summary strip */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-sm shadow-sm">
          <BookOpen className="size-3.5 text-primary/70" />
          <span className="text-muted-foreground">已订阅</span>
          <span className="font-semibold">{subCount}</span>
          <span className="text-muted-foreground">/ {MAX_SUBSCRIPTIONS_PER_TARGET}</span>
        </div>
        {banksData && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-sm shadow-sm">
            <Users className="size-3.5 text-primary/70" />
            <span className="text-muted-foreground">可用题库</span>
            <span className="font-semibold">{banksData.total}</span>
          </div>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          群组 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{groupId}</code>
        </div>
      </div>

      {/* tabs */}
      <Tabs defaultValue="banks">
        <TabsList variant="line" className="w-full justify-start border-b border-border/60 pb-0">
          <TabsTrigger value="banks" className="gap-1.5">
            <BookOpen className="size-3.5" />
            题库广场
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-1.5">
            <CheckCircle className="size-3.5" />
            已订阅
            {subCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold">
                {subCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---------- tab: 题库广场 ---------- */}
        <TabsContent value="banks" className="pt-4">
          <BanksTab
            banksData={banksData}
            banksLoading={banksLoading}
            search={search}
            setSearch={(v) => { setSearch(v); setPage(1); }}
            page={page}
            setPage={setPage}
            groupId={groupId}
            atLimit={atLimit}
            subData={subData}
            onSubscribed={refreshAll}
          />
        </TabsContent>

        {/* ---------- tab: 已订阅 ---------- */}
        <TabsContent value="subscriptions" className="pt-4">
          <SubscriptionsTab
            subData={subData}
            subLoading={subLoading}
            groupId={groupId}
            atLimit={atLimit}
            onUnsubscribe={handleUnsubscribe}
            onUpdate={refreshAll}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ========== Tab 1: 题库广场 ========== */

function BanksTab({
  banksData,
  banksLoading,
  search,
  setSearch,
  page,
  setPage,
  groupId,
  atLimit,
  subData,
  onSubscribed,
}: {
  banksData: BanksResponse | null;
  banksLoading: boolean;
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  groupId: string;
  atLimit: boolean;
  subData: GroupSubscriptionsResponse | null;
  onSubscribed: () => void;
}) {
  const subscribedMap = new Map(
    subData?.subscriptions.map((s) => [s.bankId, s]) ?? []
  );

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索题库..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-xl border-border/80 bg-card pl-10 pr-3 shadow-[0_3px_10px_rgba(44,48,54,0.05)] focus-visible:ring-primary/25"
        />
      </div>

      {banksLoading ? (
        <SkeletonCardGrid />
      ) : banksData?.banks.length ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {banksData.banks.map((bank, index) => {
              const sub = subscribedMap.get(bank.id);
              return (
                <GroupBankCard
                  key={bank.id}
                  bank={bank}
                  subscription={sub ?? null}
                  groupId={groupId}
                  atLimit={atLimit}
                  index={index}
                  onSubscribed={onSubscribed}
                />
              );
            })}
          </div>

          {banksData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {banksData.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p: number) => Math.min(banksData.totalPages, p + 1))}
                disabled={page >= banksData.totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      ) : search ? (
        <EmptyState
          title="未找到相关题库"
          description="尝试其他关键词，或创建新的题库"
        />
      ) : (
        <EmptyState
          title="尚无题库"
          description="暂时还没有可用的题库"
          illustration="book"
        />
      )}
    </div>
  );
}

/* --- bank card with inline subscription status --- */

function GroupBankCard({
  bank,
  subscription,
  groupId,
  atLimit,
  index,
  onSubscribed,
}: {
  bank: Bank;
  subscription: SubscriptionItem | null;
  groupId: string;
  atLimit: boolean;
  index: number;
  onSubscribed: () => void;
}) {
  const isSubscribed = !!subscription;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>([...DEFAULT_PUSH_TIMES]);
  const [newTime, setNewTime] = useState("");
  const [subscribing, setSubscribing] = useState(false);

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
    setPushTimes((prev) => [...prev, val].sort());
    setNewTime("");
  };

  const removeTime = (t: string) =>
    setPushTimes((prev) => prev.filter((x) => x !== t));

  const handleSubscribe = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setSubscribing(true);
    try {
      const res = await fetch(`/api/group/${groupId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId: bank.id, pushTimes }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "订阅失败");
        return;
      }
      toast.success(`已订阅「${bank.title}」`);
      setDialogOpen(false);
      onSubscribed();
    } catch {
      toast.error("订阅失败，请稍后重试");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <Card
      className="paper-rise card-hover flex flex-col"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/bank/${bank.id}`} className="min-w-0 hover:underline">
            <CardTitle className="font-serif text-base">{bank.title}</CardTitle>
          </Link>
          {isSubscribed && (
            <Badge className="shrink-0 border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              已订阅
            </Badge>
          )}
        </div>
        {bank.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{bank.description}</p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{bank._count.questions} 题</span>
          <span>{bank.subscriberCount} 人订阅</span>
          {bank.creator.name && <span>by {bank.creator.name}</span>}
        </div>

        {/* subscribed → show push times inline */}
        {isSubscribed && subscription && (
          <div className="flex flex-wrap gap-1">
            {subscription.pushTimes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md bg-primary/8 px-1.5 py-0.5 text-[11px] font-medium text-primary"
              >
                <Clock className="size-2.5" />
                {t}
              </span>
            ))}
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            render={<Link href={`/bank/${bank.id}`} />}
            nativeButton={false}
          >
            查看详情
          </Button>

          {!isSubscribed && !atLimit && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground h-7 hover:bg-primary/80 transition-colors">
                订阅
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif">订阅「{bank.title}」</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>每日推送时间</Label>
                    <p className="text-xs text-muted-foreground">
                      最多 {MAX_PUSH_TIMES_PER_SUBSCRIPTION} 个时间点，点击已有时间可删除
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
                    {pushTimes.map((t) => (
                      <Badge
                        key={t}
                        className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                        onClick={() => removeTime(t)}
                      >
                        {t} ×
                      </Badge>
                    ))}
                  </div>
                  {pushTimes.length === 0 && (
                    <p className="text-xs text-muted-foreground">点击「添加」设定推送时间</p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={subscribing}>
                    取消
                  </Button>
                  <Button onClick={handleSubscribe} disabled={subscribing}>
                    {subscribing ? "订阅中..." : "确认订阅"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {!isSubscribed && atLimit && (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground">
              订阅已满
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Tab 2: 已订阅 ========== */

function SubscriptionsTab({
  subData,
  subLoading,
  groupId,
  atLimit,
  onUnsubscribe,
  onUpdate,
}: {
  subData: GroupSubscriptionsResponse | null;
  subLoading: boolean;
  groupId: string;
  atLimit: boolean;
  onUnsubscribe: (id: string) => void;
  onUpdate: () => void;
}) {
  if (subLoading) {
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

  if (!subData?.subscriptions.length) {
    return (
      <EmptyState
        title="暂无订阅"
        description="前往「题库广场」浏览并订阅题库"
        illustration="book"
      />
    );
  }

  return (
    <div className="space-y-3">
      {subData.subscriptions.map((sub, index) => (
        <GroupSubscriptionCard
          key={sub.id}
          sub={sub}
          groupId={groupId}
          index={index}
          onUnsubscribe={() => onUnsubscribe(sub.id)}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

/* --- subscription management card (kept from original) --- */

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
          <div className="flex items-center gap-2">
            <Link href={`/bank/${sub.bank.id}`} className="hover:underline">
              <CardTitle className="font-serif text-base">
                {sub.bank.title}
              </CardTitle>
            </Link>
          </div>
          {sub.bank.description && (
            <p className="truncate text-xs text-muted-foreground">
              {sub.bank.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {sub.pushTimes.map((t) => (
              <Badge key={t} variant="secondary">
                <Clock className="mr-0.5 size-2.5" />
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
