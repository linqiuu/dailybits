"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Stats {
  subscribedCount: number;
  todayPushed: number;
  todayTotal: number;
  createdBanksCount: number;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.subscribedCount !== undefined) {
          setStats(data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="card-hover animate-pulse">
            <CardContent className="pt-6">
              <div className="h-10 w-16 rounded bg-muted" />
              <div className="mt-2 h-4 w-24 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const s = stats ?? {
    subscribedCount: 0,
    todayPushed: 0,
    todayTotal: 0,
    createdBanksCount: 0,
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="card-hover">
        <CardContent className="pt-6">
          <p className="font-serif text-3xl font-semibold text-foreground">
            {s.subscribedCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">已订阅</p>
        </CardContent>
      </Card>
      <Card className="card-hover">
        <CardContent className="pt-6">
          <p className="font-serif text-3xl font-semibold text-foreground">
            {s.todayPushed} / {s.todayTotal}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">今日推送</p>
        </CardContent>
      </Card>
      <Card className="card-hover">
        <CardContent className="pt-6">
          <p className="font-serif text-3xl font-semibold text-foreground">
            {s.createdBanksCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">我创建的</p>
        </CardContent>
      </Card>
    </div>
  );
}
