"use client";

import { useEffect, useState } from "react";
import { BellRing, LibraryBig, Send } from "lucide-react";
import { MetricLine } from "@/components/ui/workbench";
import { RequestState } from "@/components/ui/request-state";

interface Stats {
  subscribedCount: number;
  todayPushed: number;
  todayTotal: number;
  createdQuestionBanksCount: number;
  createdKnowledgeBanksCount: number;
  createdBanksCount: number;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => { if (!res.ok) throw new Error("Unavailable"); return res.json(); })
      .then((data) => {
        if (data.subscribedCount !== undefined) {
          setStats(data);
          setFailed(false);
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return (
      <div className="metric-strip grid-cols-1 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="metric-cell animate-pulse">
              <div className="h-10 w-16 rounded bg-muted" />
              <div className="mt-2 h-4 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (failed) return <RequestState title="统计暂时加载失败" onRetry={() => setReload((value) => value + 1)} />;

  const s = stats ?? {
    subscribedCount: 0,
    todayPushed: 0,
    todayTotal: 0,
    createdQuestionBanksCount: 0,
    createdKnowledgeBanksCount: 0,
    createdBanksCount: 0,
  };

  return (
    <div className="metric-strip grid-cols-1 sm:grid-cols-3">
      <MetricLine icon={BellRing} label="已订阅" value={s.subscribedCount} tone="primary" />
      <MetricLine
        icon={Send}
        label="今日推送"
        value={s.todayPushed}
        detail={`当前配置 ${s.todayTotal} 个今日时段`}
        tone="accent"
      />
      <MetricLine
        icon={LibraryBig}
        label="我创建的"
        value={s.createdBanksCount}
        detail={`题库 ${s.createdQuestionBanksCount}，知识库 ${s.createdKnowledgeBanksCount}`}
        tone="ink"
      />
    </div>
  );
}
