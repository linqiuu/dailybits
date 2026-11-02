"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BookMarked, BookOpenCheck, ListChecks, Users } from "lucide-react";
import { useSession } from "@/lib/client-auth";
import { AuthenticationState } from "@/components/authentication-state";
import { BankExplorer } from "@/components/bank/bank-explorer";
import { KnowledgeExplorer } from "@/components/knowledge/knowledge-explorer";
import { DigestSubscriptionList } from "@/components/dashboard/digest-subscription-list";
import { SubscriptionPanel, type SubscriptionSummary } from "@/components/bank/subscription-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestState } from "@/components/ui/request-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupEntryDialog } from "./group-entry-dialog";
import type { SubscriptionCadence, SubscriptionScheduleMode } from "@/types";

interface GroupSubscription extends SubscriptionSummary {
  bankId: string;
  subscriber?: { name: string | null; uid: string | null } | null;
  bank: {
    title: string;
    subscriptionScheduleMode?: SubscriptionScheduleMode;
    subscriptionCadence?: SubscriptionCadence;
    subscriptionWeekdays?: number[];
    subscriptionPushTimes?: string[];
  };
  questionCount?: number;
  pointCount?: number;
  pushedCount: number;
}

function useGroupSubscriptions(endpoint: string) {
  const [subscriptions, setSubscriptions] = useState<GroupSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!Array.isArray(data.subscriptions)) throw new Error("Invalid response");
      if (!controller.signal.aborted) setSubscriptions(data.subscriptions);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => { clearTimeout(timer); currentRequest.current?.abort(); };
  }, [refresh]);

  return { subscriptions, loading, failed, refresh };
}

export function GroupDashboard({ groupId }: { groupId: string }) {
  const { status } = useSession();
  return (
    <div className="page-enter space-y-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold">群订阅</h1>
          <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
            <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="max-w-[64ch] break-all">接收群：<span className="font-medium text-foreground">{groupId}</span></span>
          </p>
        </div>
        <GroupEntryDialog groupId={groupId} />
      </header>
      {status === "authenticated" ? <GroupContent key={groupId} groupId={groupId} /> : <AuthenticationState />}
    </div>
  );
}

function GroupContent({ groupId }: { groupId: string }) {
  const { data: session } = useSession();
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">仅展示可推送到群的公开内容，个人订阅不受影响。</p>
      <Tabs defaultValue="banks">
        <TabsList variant="line" className="h-11 gap-5">
          <TabsTrigger value="banks"><BookOpenCheck className="size-4" aria-hidden />题库</TabsTrigger>
          <TabsTrigger value="knowledge"><BookMarked className="size-4" aria-hidden />知识卡片</TabsTrigger>
          <TabsTrigger value="digests"><Bell className="size-4" aria-hidden />资讯与热榜</TabsTrigger>
          <TabsTrigger value="subscriptions"><ListChecks className="size-4" aria-hidden />{session?.user.isAdmin ? "群订阅管理" : "我创建的订阅"}</TabsTrigger>
        </TabsList>
        <TabsContent value="banks" className="pt-4">
          <BankExplorer targetType="GROUP" targetId={groupId} showCreate={false} layout="list" />
        </TabsContent>
        <TabsContent value="knowledge" className="pt-4">
          <KnowledgeExplorer targetType="GROUP" targetId={groupId} showCreate={false} layout="list" />
        </TabsContent>
        <TabsContent value="digests" className="pt-4">
          <DigestSubscriptionList targetType="GROUP" targetId={groupId} title="本群每日精选" />
        </TabsContent>
        <TabsContent value="subscriptions" className="space-y-6 pt-4">
          <GroupSubscriptionsSection groupId={groupId} kind="QUESTION" />
          <GroupSubscriptionsSection groupId={groupId} kind="KNOWLEDGE" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupSubscriptionsSection({ groupId, kind }: { groupId: string; kind: "QUESTION" | "KNOWLEDGE" }) {
  const isQuestion = kind === "QUESTION";
  const endpoint = isQuestion
    ? `/api/group/${groupId}/subscriptions`
    : `/api/knowledge-subscriptions?${new URLSearchParams({ targetType: "GROUP", targetId: groupId })}`;
  const { subscriptions, loading, failed, refresh } = useGroupSubscriptions(endpoint);
  const label = isQuestion ? "题库" : "知识卡片";

  return (
    <section className="space-y-3" aria-label={`${label}群订阅`}>
      <h2 className="text-base font-semibold">{label}</h2>
      {loading ? <RequestState title={`正在加载${label}订阅`} loading /> : failed ? (
        <RequestState title={`${label}订阅暂时加载失败`} onRetry={() => void refresh()} />
      ) : subscriptions.length ? (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardHeader>
                <CardTitle className="break-words text-base leading-6"><Link href={`/${isQuestion ? "bank" : "knowledge"}/${sub.bankId}`} className="hover:underline">{sub.bank.title}</Link></CardTitle>
                <p className="break-words text-xs text-muted-foreground">订阅人：{sub.subscriber?.name || sub.subscriber?.uid || "未记录"}{sub.subscriber?.name && sub.subscriber.uid ? ` · ${sub.subscriber.uid}` : ""}</p>
              </CardHeader>
              <CardContent>
                <SubscriptionPanel framed={false} kind={kind} bankId={sub.bankId} targetType="GROUP" targetId={groupId}
                  bankSchedule={{
                    subscriptionScheduleMode: sub.bank.subscriptionScheduleMode ?? "CUSTOM",
                    subscriptionCadence: sub.bank.subscriptionCadence ?? "DAILY",
                    subscriptionWeekdays: sub.bank.subscriptionWeekdays ?? [],
                    subscriptionPushTimes: sub.bank.subscriptionPushTimes ?? [],
                  }}
                  initialSubscription={sub} totalQuestions={(isQuestion ? sub.questionCount : sub.pointCount) ?? 0}
                  pushedCount={sub.pushedCount} onChanged={() => void refresh()} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : <EmptyState title={`暂无可管理的${label}订阅`} description="在对应栏目订阅后，可在这里管理推送。" variant="compact" />}
    </section>
  );
}
