"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface PushLogItem {
  pushedAt: string;
  bankName: string;
  questionExcerpt: string;
  correctAnswer: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return d.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PushHistory() {
  const [logs, setLogs] = useState<PushLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = (p: number, append: boolean) => {
    fetch(`/api/push/logs?page=${p}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) {
          setLogs((prev) => (append ? [...prev, ...data.logs] : data.logs));
          setTotalPages(data.totalPages ?? 0);
        }
      })
      .finally(() => {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    fetchLogs(1, false);
  }, []);

  const loadMore = () => {
    const next = page + 1;
    if (next <= totalPages) {
      setLoadingMore(true);
      setPage(next);
      fetchLogs(next, true);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-xl font-semibold">推送记录</h2>
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">推送记录</h2>
      <Card>
        <CardContent className="py-6">
          {logs.length === 0 ? (
            <EmptyState
              title="暂无推送记录"
              description="泡一杯茶，订阅后系统会按你设定的时间送来今日一题。"
              illustration="tea"
              action={{ label: "查看我的订阅", href: "/dashboard" }}
            />
          ) : (
            <ul className="space-y-4">
              {logs.map((log, i) => (
                <li
                  key={`${log.pushedAt}-${log.bankName}-${i}`}
                  className="flex gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTime(log.pushedAt)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {log.bankName}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {log.questionExcerpt}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {page < totalPages && totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
