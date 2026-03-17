"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BankCard } from "./bank-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { Search } from "lucide-react";

interface Bank {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  subscriberCount: number;
  creator: { id: string; name: string | null; image: string | null };
  _count: { questions: number };
  isSubscribed?: boolean;
}

interface ApiResponse {
  banks: Bank[];
  total: number;
  page: number;
  totalPages: number;
  isLoggedIn?: boolean;
}

export function BankExplorer() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (search === debouncedSearch) return;
    setLoading(true);
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

  const fetchBanks = useCallback(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    fetch(`/api/banks?${params}`)
      .then((res) => res.json())
      .then((json: ApiResponse | { error: string }) => {
        if (id !== fetchIdRef.current) return;
        if ("error" in json) {
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) setData(null);
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索题库..."
            value={search}
            onChange={handleSearchChange}
            className="h-10 rounded-xl border-border/80 bg-card pl-10 pr-3 shadow-[0_3px_10px_rgba(44,48,54,0.05)] focus-visible:ring-primary/25"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonCardGrid />
      ) : data?.banks.length ? (
        <>
          <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.banks.map((bank, index) => (
              <div key={bank.id} className="w-full max-w-sm">
                <BankCard
                  id={bank.id}
                  title={bank.title}
                  creator={bank.creator}
                  questionCount={bank._count.questions}
                  subscriberCount={bank.subscriberCount}
                  isLoggedIn={data?.isLoggedIn}
                  isSubscribed={bank.isSubscribed}
                  appearDelayMs={index * 70}
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
        />
      ) : (
        <EmptyState
          title="尚无题库，成为第一个创建者"
          description="创建你的第一个题库，开始每日一题"
          action={{ label: "创建题库", href: "/bank/new" }}
        />
      )}

      <Button
        className="fixed bottom-6 right-6 z-50 shadow-lg"
        size="lg"
        render={<Link href="/bank/new" />}
        nativeButton={false}
      >
        创建题库
      </Button>
    </div>
  );
}
