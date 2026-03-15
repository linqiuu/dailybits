"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface BankCardProps {
  id: string;
  title: string;
  creator: { id: string; name: string | null; image: string | null };
  questionCount: number;
  subscriberCount: number;
  isLoggedIn?: boolean;
  isSubscribed?: boolean;
  appearDelayMs?: number;
}

export function BankCard({
  id,
  title,
  creator,
  questionCount,
  subscriberCount,
  isLoggedIn = false,
  isSubscribed = false,
  appearDelayMs = 0,
}: BankCardProps) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [subCount, setSubCount] = useState(subscriberCount);
  const [open, setOpen] = useState(false);
  const [pushTimes, setPushTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("08:00");
  const [loading, setLoading] = useState(false);

  const addTime = () => {
    const val = newTime.trim();
    if (!val || pushTimes.includes(val)) return;
    setPushTimes((prev) => [...prev, val].sort());
  };

  const removeTime = (t: string) => {
    setPushTimes((prev) => prev.filter((x) => x !== t));
  };

  const handleSubscribe = async () => {
    if (pushTimes.length === 0) {
      toast.error("请至少添加一个推送时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId: id, pushTimes }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "订阅失败");
        return;
      }
      toast.success("订阅成功！将按设定时间推送题目");
      setSubscribed(true);
      setSubCount((c) => c + 1);
      setOpen(false);
    } catch {
      toast.error("订阅失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="paper-rise card-hover flex flex-col"
      style={{ animationDelay: `${appearDelayMs}ms` }}
    >
      <CardHeader className="pb-2">
        <Link href={`/bank/${id}`} className="hover:underline">
          <CardTitle className="font-serif text-lg">{title}</CardTitle>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            创建者：{creator.name ?? "未知"}
          </p>
          <p className="text-sm text-muted-foreground">
            {questionCount} 题 · {subCount} 人订阅
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/bank/${id}`} />}
            nativeButton={false}
          >
            查看详情
          </Button>
          {isLoggedIn && !subscribed && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground h-7 hover:bg-primary/80 transition-colors">
                订阅
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif">订阅「{title}」</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>选择每日推送时间</Label>
                    <p className="text-xs text-muted-foreground">
                      默认仅工作日推送（自动跳过周末与法定节假日）
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" variant="secondary" size="sm" onClick={addTime}>
                        添加
                      </Button>
                    </div>
                  </div>
                  {pushTimes.length > 0 && (
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
                  )}
                  {pushTimes.length === 0 && (
                    <p className="text-xs text-muted-foreground">点击「添加」设定推送时间，支持多个时间点</p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                    取消
                  </Button>
                  <Button onClick={handleSubscribe} disabled={loading}>
                    {loading ? "订阅中..." : "确认订阅"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {subscribed && (
            <Badge className="bg-success/10 text-success border-0">已订阅</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
