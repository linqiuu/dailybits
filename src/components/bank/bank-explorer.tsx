"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BankCard } from "./bank-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";

interface Bank {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  subscriberCount: number;
  creator: { id: string; name: string | null; image: string | null };
  _count: { questions: number };
}

interface ApiResponse {
  banks: Bank[];
  total: number;
  page: number;
  totalPages: number;
}

export function BankExplorer() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    fetch(`/api/banks?${params}`)
      .then((res) => res.json())
      .then((json: ApiResponse | { error: string }) => {
        if ("error" in json) {
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [debouncedSearch, page]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Input
          placeholder="搜索题库..."
          value={search}
          onChange={handleSearchChange}
          className="border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {loading ? (
        <SkeletonCardGrid />
      ) : data?.banks.length ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.banks.map((bank) => (
              <BankCard
                key={bank.id}
                id={bank.id}
                title={bank.title}
                creator={bank.creator}
                questionCount={bank._count.questions}
                subscriberCount={bank.subscriberCount}
              />
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
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages, p + 1))
                }
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
