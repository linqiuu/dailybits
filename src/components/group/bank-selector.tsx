"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  DEFAULT_PUSH_TIMES,
  MAX_PUSH_TIMES_PER_SUBSCRIPTION,
} from "@/types";

interface Bank {
  id: string;
  title: string;
  subscriberCount: number;
  _count: { questions: number };
  isSubscribed?: boolean;
}

interface BankSelectorProps {
  groupId: string;
  onSuccess: () => void;
}

export function BankSelector({ groupId, onSuccess }: BankSelectorProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [pushTimes, setPushTimes] = useState<string[]>([...DEFAULT_PUSH_TIMES]);
  const [newTime, setNewTime] = useState("");
  const [subscribing, setSubscribing] = useState(false);

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
    params.set("targetType", "GROUP");
    params.set("targetId", groupId);
    fetch(`/api/banks?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (id !== fetchIdRef.current) return;
        if ("banks" in json) {
          setBanks(json.banks);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [debouncedSearch, groupId]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const atTimeLimit = pushTimes.length >= MAX_PUSH_TIMES_PER_SUBSCRIPTION;

  const addTime = () => {
    const val = newTime.trim();
    if (!val || !/^\d{2}:\d{2}$/.test(val)) {
      toast.error("请输入有效的 HH:MM 格式时间");
      return;
    }
    if (pushTimes.includes(val)) {
      toast.error("该时间已存在");
      return;
    }
    setPushTimes((prev) => [...prev, val].sort());
    setNewTime("");
  };

  const removeTime = (t: string) => {
    setPushTimes((prev) => prev.filter((x) => x !== t));
  };

  const handleSubscribe = async () => {
    if (!selectedBank) return;
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setSubscribing(true);
    try {
      const res = await fetch(`/api/group/${groupId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: selectedBank.id,
          pushTimes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success(`已订阅「${selectedBank.title}」`);
      onSuccess();
    } catch {
      toast.error("订阅失败，请稍后重试");
    } finally {
      setSubscribing(false);
    }
  };

  if (selectedBank) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>已选择题库</Label>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{selectedBank.title}</p>
              <p className="text-xs text-muted-foreground">
                {selectedBank._count.questions} 题 · {selectedBank.subscriberCount} 人订阅
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedBank(null)}>
              更换
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>推送时间</Label>
          <p className="text-xs text-muted-foreground">
            设定每日推送时间点（最多 {MAX_PUSH_TIMES_PER_SUBSCRIPTION} 个）
          </p>
          <div className="flex gap-2">
            <Input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addTime}
              disabled={atTimeLimit}
            >
              添加
            </Button>
          </div>
          {atTimeLimit && (
            <p className="text-xs text-amber-600">
              已达上限 {MAX_PUSH_TIMES_PER_SUBSCRIPTION}/{MAX_PUSH_TIMES_PER_SUBSCRIPTION}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pushTimes.map((t) => (
              <Badge
                key={t}
                className="cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                onClick={() => removeTime(t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
          {pushTimes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              点击「添加」设定推送时间
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setSelectedBank(null)} disabled={subscribing}>
            返回
          </Button>
          <Button onClick={handleSubscribe} disabled={subscribing}>
            {subscribing ? "订阅中..." : "确认订阅"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索题库..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : banks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            未找到相关题库
          </p>
        ) : (
          banks.map((bank) => (
            <button
              key={bank.id}
              className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setSelectedBank(bank)}
              disabled={bank.isSubscribed}
            >
              <div>
                <p className="text-sm font-medium">{bank.title}</p>
                <p className="text-xs text-muted-foreground">
                  {bank._count.questions} 题 · {bank.subscriberCount} 人订阅
                </p>
              </div>
              {bank.isSubscribed ? (
                <Badge variant="secondary">已订阅</Badge>
              ) : (
                <Badge className="bg-primary/10 text-primary">选择</Badge>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
