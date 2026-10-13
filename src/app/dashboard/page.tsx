"use client";

import Link from "next/link";
import { useSession } from "@/lib/client-auth";
import { AuthenticationState } from "@/components/authentication-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CreatedContentList } from "@/components/dashboard/created-content-list";
import { SubscriptionList } from "@/components/dashboard/subscription-list";
import { KnowledgeSubscriptionList } from "@/components/dashboard/knowledge-subscription-list";
import { DigestSubscriptionList } from "@/components/dashboard/digest-subscription-list";
import { PushHistory } from "@/components/dashboard/push-history";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/workbench";

export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session) return <AuthenticationState />;

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        title="我的 DailyBits"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              render={<Link href="/knowledge/new" />}
              nativeButton={false}
            >
              创建知识库
            </Button>
            <Button render={<Link href="/bank/new" />} nativeButton={false}>
              创建题库
            </Button>
          </div>
        }
      />
      <StatsCards />
      <Tabs defaultValue="subscriptions" className="space-y-5">
        <TabsList>
          <TabsTrigger value="subscriptions">我的订阅</TabsTrigger>
          <TabsTrigger value="created">我创建的</TabsTrigger>
          <TabsTrigger value="history">推送记录</TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions" className="space-y-7">
          <div className="grid gap-6 lg:grid-cols-2">
            <SubscriptionList />
            <KnowledgeSubscriptionList />
          </div>
          <DigestSubscriptionList />
        </TabsContent>
        <TabsContent value="created"><CreatedContentList /></TabsContent>
        <TabsContent value="history"><PushHistory /></TabsContent>
      </Tabs>
    </div>
  );
}
