"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { KnowledgeCard } from "./knowledge-card";

interface KnowledgeBank {
  id: string;
  title: string;
  description: string | null;
  subscriberCount: number;
  creator: { id: string; name: string | null; image: string | null; uid?: string | null };
  _count: { points: number };
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
}: {
  targetType?: "USER" | "GROUP";
  targetId?: string;
  showCreate?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (search === debouncedSearch) return;
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search, debouncedSearch]);

  const fetchBanks = useCallback(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("targetType", targetType);
    if (targetId) params.set("targetId", targetId);
    fetch(`/api/knowledge-banks?${params}`)
      .then((res) => res.json())
      .then((json: ApiResponse | { error: string }) => {
        if (id !== fetchIdRef.current) return;
        setData("error" in json ? null : json);
      })
      .catch(() => {
        if (id === fetchIdRef.current) setData(null);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索知识库..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border-border/80 bg-card pl-10 pr-3 shadow-[0_3px_10px_rgba(44,48,54,0.05)] focus-visible:ring-primary/25"
          />
        </div>
        {data?.isLoggedIn && showCreate ? (
          <Button
            className="h-10 shrink-0 shadow-md sm:px-5"
            size="lg"
            render={<Link href="/knowledge/new" />}
            nativeButton={false}
          >
            创建知识库
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonCardGrid />
      ) : data?.banks.length ? (
        <>
          <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.banks.map((bank, index) => (
              <div key={bank.id} className="w-full max-w-sm">
                <KnowledgeCard
                  id={bank.id}
                  title={bank.title}
                  creator={bank.creator}
                  pointCount={bank._count.points}
                  subscriberCount={bank.subscriberCount}
                  isLoggedIn={data.isLoggedIn}
                  isSubscribed={bank.isSubscribed}
                  subscriptionCount={data.subscriptionCount ?? 0}
                  appearDelayMs={index * 70}
                  targetType={targetType}
                  targetId={targetId}
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
        />
      ) : (
        <EmptyState
          title="尚无知识库"
          description="创建一个知识库，把长文本整理成每日可推送的知识卡片。"
          action={{ label: "创建知识库", href: "/knowledge/new" }}
        />
      )}
    </div>
  );
}
