"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { SubscriptionList } from "@/components/dashboard/subscription-list";
import { PushHistory } from "@/components/dashboard/push-history";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <h1 className="font-serif text-3xl font-semibold tracking-wide text-foreground">我的书房</h1>
      <StatsCards />
      <SubscriptionList />
      <PushHistory />
    </div>
  );
}
