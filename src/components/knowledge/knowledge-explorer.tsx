"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { KnowledgeCard } from "./knowledge-card";
import { RequestState } from "@/components/ui/request-state";

interface KnowledgeBank {
  id: string;
  title: string;
  description: string | null;
  subscriberCount: number;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  _count: { points: number };
  recommendedSubscriptionMode: "CURRENT_EDITION" | "FOLLOW_UPDATES";
  isSubscribed?: boolean;
}

interface ApiResponse {
  banks: KnowledgeBank[];
  total: number;
  page: number;
  totalPages: number;
  isLoggedIn?: boolean;
  subscriptionCount?: number;
}

export function KnowledgeExplorer({
  targetType = "USER",
  targetId,
  showCreate = true,
  emptyVariant = "default",
  layout = "grid",
  onSubscribed,
}: {
  targetType?: "USER" | "GROUP";
  targetId?: string;
  showCreate?: boolean;
  emptyVariant?: "default" | "compact";
  layout?: "grid" | "list";
  onSubscribed?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search, debouncedSearch]);

  const fetchBanks = useCallback(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("targetType", targetType);
    if (targetId) params.set("targetId", targetId);
    fetch(`/api/knowledge-banks?${params}`)
      .then((res) => { if (!res.ok) throw new Error("Unavailable"); return res.json(); })
      .then((json: ApiResponse | { error: string }) => {
        if (id !== fetchIdRef.current) return;
        if ("error" in json) { setData(null); setFailed(true); } else setData(json);
      })
      .catch(() => {
        if (id === fetchIdRef.current) { setData(null); setFailed(true); }
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [debouncedSearch, page, targetId, targetType]);

  useEffect(() => {
    const timeout = setTimeout(fetchBanks, 0);
    return () => clearTimeout(timeout);
  }, [fetchBanks]);

  return (
    <div className="space-y-4">
      <div className="stream-toolbar flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索知识库"
            placeholder="搜索知识库..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="h-10 border-border bg-card pl-10 pr-3 shadow-none"
          />
        </div>
        {!loading && !failed && data ? <span className="text-xs text-muted-foreground" aria-live="polite">{data.total} 个知识库</span> : null}
        {data?.isLoggedIn && showCreate ? (
          <Button
            className="ml-auto h-10 shrink-0"
            size="lg"
            render={<Link href="/knowledge/new" />}
            nativeButton={false}
          >
            创建知识库
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonCardGrid catalog={layout === "list"} />
      ) : failed ? (
        <RequestState title="知识库暂时加载失败" onRetry={fetchBanks} />
      ) : data?.banks.length ? (
        <>
          <div
            className={
              layout === "list"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                : "grid grid-cols-1 gap-4 md:grid-cols-2"
            }
          >
            {data.banks.map((bank) => (
              <div key={bank.id} className="w-full">
                <KnowledgeCard
                  id={bank.id}
                  title={bank.title}
                  description={bank.description}
                  creator={bank.creator}
                  recommendedSubscriptionMode={bank.recommendedSubscriptionMode}
                  pointCount={bank._count.points}
                  subscriberCount={bank.subscriberCount}
                  isLoggedIn={data.isLoggedIn}
                  isSubscribed={bank.isSubscribed}
                  subscriptionCount={data.subscriptionCount ?? 0}
                  targetType={targetType}
                  targetId={targetId}
                  onSubscribed={() => { fetchBanks(); onSubscribed?.(); }}
                />
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
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
                onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}
                disabled={page >= data.totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      ) : debouncedSearch ? (
        <EmptyState
          title="未找到相关知识库"
          description="尝试其他关键词，或创建新的知识库。"
          variant={emptyVariant}
        />
      ) : (
        <EmptyState
          title={targetType === "GROUP" ? "暂无可供群订阅的公开知识库" : "尚无知识库"}
          description={targetType === "GROUP" ? "公开知识库发布后会显示在这里。" : "创建一个知识库，把长文本整理成每日可推送的知识卡片。"}
          action={showCreate ? { label: "创建知识库", href: "/knowledge/new" } : undefined}
          variant={emptyVariant}
        />
      )}
    </div>
  );
}
