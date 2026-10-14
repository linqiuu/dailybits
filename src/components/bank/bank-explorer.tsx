"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BankCard } from "./bank-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { Search } from "lucide-react";
import { RequestState } from "@/components/ui/request-state";

interface Bank {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  subscriberCount: number;
  answerCount: number;
  correctAnswerCount: number;
  answererCount: number;
  recommendedSubscriptionMode: "CURRENT_EDITION" | "FOLLOW_UPDATES";
  subscriptionScheduleMode: "CUSTOM" | "FIXED";
  subscriptionCadence: "DAILY" | "WEEKLY";
  subscriptionWeekdays: number[];
  subscriptionPushTimes: string[];
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  _count: { questions: number };
  isSubscribed?: boolean;
}

interface ApiResponse {
  banks: Bank[];
  total: number;
  page: number;
  totalPages: number;
  isLoggedIn?: boolean;
  subscriptionCount?: number;
}

export function BankExplorer({
  showCreate = true,
  emptyVariant = "default",
  layout = "grid",
}: {
  showCreate?: boolean;
  emptyVariant?: "default" | "compact";
  layout?: "grid" | "list";
} = {}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

  const fetchBanks = useCallback(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    fetch(`/api/banks?${params}`)
      .then((res) => res.json())
      .then((json: ApiResponse | { error: string }) => {
        if (id !== fetchIdRef.current) return;
        if ("error" in json) {
          setData(null);
          setError(true);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) {
          setData(null);
          setError(true);
        }
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [debouncedSearch, page]);

  useEffect(() => {
    const timeout = setTimeout(fetchBanks, 0);
    return () => clearTimeout(timeout);
  }, [fetchBanks]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="stream-toolbar flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索题库"
            placeholder="搜索题库..."
            value={search}
            onChange={handleSearchChange}
            className="h-11 rounded-[var(--radius)] border-border/80 bg-card pl-10 pr-3 shadow-none focus-visible:ring-primary/20"
          />
        </div>
        {data?.isLoggedIn && showCreate ? (
          <Button
            className="h-11 shrink-0 sm:px-5"
            size="lg"
            render={<Link href="/bank/new" />}
            nativeButton={false}
          >
            创建题库
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonCardGrid />
      ) : error ? (
        <RequestState title="题库暂时加载失败" onRetry={fetchBanks} />
      ) : data?.banks.length ? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>共 {data.total} 个题库</span>
            <span>第 {page} / {data.totalPages} 页</span>
          </div>
          <div
            className={
              layout === "list"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                : "grid grid-cols-1 gap-4 md:grid-cols-2"
            }
          >
            {data.banks.map((bank, index) => (
              <div key={bank.id} className="w-full">
                <BankCard
                  id={bank.id}
                  title={bank.title}
                  description={bank.description}
                  creator={bank.creator}
                  questionCount={bank._count.questions}
                  subscriberCount={bank.subscriberCount}
                  answerCount={bank.answerCount}
                  correctAnswerCount={bank.correctAnswerCount}
                  answererCount={bank.answererCount}
                  recommendedSubscriptionMode={bank.recommendedSubscriptionMode}
                  subscriptionScheduleMode={bank.subscriptionScheduleMode}
                  subscriptionCadence={bank.subscriptionCadence}
                  subscriptionWeekdays={bank.subscriptionWeekdays}
                  subscriptionPushTimes={bank.subscriptionPushTimes}
                  isLoggedIn={data?.isLoggedIn}
                  isSubscribed={bank.isSubscribed}
                  subscriptionCount={data?.subscriptionCount ?? 0}
                  appearDelayMs={index * 70}
                  compact={layout === "list"}
                />
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      ) : debouncedSearch ? (
        <EmptyState
          title="未找到相关题库"
          description="尝试其他关键词，或创建新的题库"
          variant={emptyVariant}
        />
      ) : (
        <EmptyState
          title="尚无题库，成为第一个创建者"
          description="创建你的第一个题库，开始每日一题"
          action={{ label: "创建题库", href: "/bank/new" }}
          variant={emptyVariant}
        />
      )}
    </div>
  );
}
