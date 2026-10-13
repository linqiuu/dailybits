"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSession } from "@/lib/client-auth";
import { AuthenticationState } from "@/components/authentication-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestState } from "@/components/ui/request-state";
import { MetricLine, PageHeader } from "@/components/ui/workbench";
import { DELIVERY_STATUS_LABELS, deliveryErrorLabel } from "@/lib/push/status";

interface BankUsage {
  id: string; title: string; questionCount: number; subscriberCount: number; answers: number; answerers: number; accuracy: number;
}
interface Overview {
  totals: { banks: number; questionBanks: number; knowledgeBanks: number; questions: number; knowledgePoints: number; activeSubscriptions: number; periodAnswers: number; periodAnswerers: number; todayAnswers: number; todayAnswerers: number; todayAccuracy: number };
  daily: Array<{ date: string; answers: number; answerers: number; accuracy: number }>;
  topBanks: BankUsage[];
  topSubscribedBanks: BankUsage[];
  operations: { schedulerLastTickAt: string | null; schedulerHealthy: boolean; pushConfigured: boolean; qaLastSyncAt: string | null; qaSyncError: string | null; jobs: Record<string, number>; failures: Array<{ id: string; kind: string; status: string; scheduleDate: string; pushTime: string; attempts: number; lastErrorCode: string | null }>; caches: Array<{ digestType: string; fetchedAt: string; available: boolean }> };
}
const number = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const time = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "暂无记录";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [rankBy, setRankBy] = useState<"answers" | "subscribers">("answers");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user.isAdmin) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/overview?days=${days}`, { cache: "no-store", signal: controller.signal })
        .then(res => { if (!res.ok) throw new Error("Unavailable"); return res.json(); })
        .then(data => { if (!controller.signal.aborted) { if (!data.totals || !Array.isArray(data.daily)) throw new Error("Invalid overview"); setOverview(data); setFailed(false); } })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [status, session?.user.isAdmin, days, reload]);

  if (status !== "authenticated" || !session) return <AuthenticationState />;
  if (!session.user.isAdmin) return <RequestState title="需要管理员权限" description="当前账号没有访问总览的权限。" />;
  if (loading && !overview) return <RequestState title="加载总览中" loading />;
  if (failed && !overview) return <RequestState title="总览暂时加载失败" description="没有读取到统计数据，请重试。" onRetry={() => setReload(value => value + 1)} />;
  if (!overview) return null;
  const totals = overview.totals;
  const ops = overview.operations;
  const ranked = rankBy === "answers" ? overview.topBanks : overview.topSubscribedBanks;

  return <div className="space-y-7 page-enter">
    <PageHeader title="使用总览" action={<div className="flex gap-2">{[7,14,30].map(value => <Button key={value} size="sm" variant={days === value ? "default" : "outline"} aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</Button>)}</div>} />
    {failed && <RequestState title="更新失败，当前显示上次成功读取的数据" onRetry={() => setReload(value => value + 1)} />}
    {loading && <p role="status" className="text-xs text-muted-foreground">更新中...</p>}
    <div className="metric-strip grid-cols-4">
      <MetricLine label="内容库" value={number(totals.banks)} detail={`题库 ${totals.questionBanks} · 知识库 ${totals.knowledgeBanks}`} />
      <MetricLine label="题目与知识点" value={number(totals.questions + totals.knowledgePoints)} tone="ink" />
      <MetricLine label="今日答题人数" value={number(totals.todayAnswerers)} detail={`${totals.todayAnswers} 次 · 正确率 ${totals.todayAccuracy}%`} tone="accent" />
      <MetricLine label="活跃订阅" value={number(totals.activeSubscriptions)} detail={`近 ${days} 天 ${totals.periodAnswerers} 人答题`} tone="ink" />
    </div>
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">每日答题趋势</h2>
      {overview.daily.some(item => item.answers > 0) ? <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={overview.daily} accessibilityLayer margin={{ left: 0, right: 8, bottom: 0, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={value => String(value).slice(5)} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} />
            <Legend />
            <Bar dataKey="answers" name="答题次数" fill="var(--primary)" radius={[3,3,0,0]} isAnimationActive={false} />
            <Bar dataKey="answerers" name="答题人数" fill="var(--accent)" radius={[3,3,0,0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <p className="py-5 text-sm text-muted-foreground">最近 {days} 天暂无答题记录。</p>}
    </section>
    <section className="space-y-4 border-t pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">题库使用排行</h2>
        <div className="flex gap-2"><Button size="sm" variant={rankBy === "answers" ? "secondary" : "ghost"} aria-pressed={rankBy === "answers"} onClick={() => setRankBy("answers")}>答题量</Button><Button size="sm" variant={rankBy === "subscribers" ? "secondary" : "ghost"} aria-pressed={rankBy === "subscribers"} onClick={() => setRankBy("subscribers")}>订阅量</Button></div>
      </div>
      {ranked?.length ? <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-3 font-medium">题库</th><th className="pb-3 font-medium">答题人数</th><th className="pb-3 font-medium">答题次数</th><th className="pb-3 font-medium">正确率</th><th className="pb-3 font-medium">订阅人数</th></tr></thead>
        <tbody>{ranked.map(bank => <tr key={bank.id} className="border-b last:border-0"><td className="py-3"><Link className="font-medium hover:underline" href={`/bank/${bank.id}`}>{bank.title}</Link><span className="ml-2 text-xs text-muted-foreground">{bank.questionCount} 题</span></td><td>{bank.answerers}</td><td>{bank.answers}</td><td>{bank.answers ? `${bank.accuracy}%` : "—"}</td><td>{bank.subscriberCount}</td></tr>)}</tbody>
      </table> : <p className="py-4 text-sm text-muted-foreground">暂无题库。</p>}
    </section>
    {ops && <section className="space-y-4 border-t pt-6">
      <h2 className="text-lg font-semibold">推送运行状态</h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Badge variant="outline" className={ops.schedulerHealthy ? "text-success" : "text-destructive"}>{ops.schedulerHealthy ? "调度器正常" : "未收到调度器心跳"}</Badge>
        <span className="text-muted-foreground">最近检查 {time(ops.schedulerLastTickAt)}</span>
        <span>{ops.jobs.PENDING ?? 0} 待处理 · {ops.jobs.FAILED ?? 0} 失败 · {ops.jobs.UNKNOWN ?? 0} 待确认</span>
        {!ops.pushConfigured && <span className="text-destructive">推送配置缺失</span>}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>答题同步 {time(ops.qaLastSyncAt)}{ops.qaSyncError ? " · 暂时失败" : ""}</span>
        {ops.caches.map(cache => <span key={cache.digestType}>{cache.digestType === "AI_NEWS" ? "AI 新闻" : "GitHub 热榜"}更新 {time(cache.fetchedAt)}{cache.available ? "" : " · 内容暂不可用"}</span>)}
      </div>
      {ops.failures.length > 0 && <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 font-medium">计划时间</th><th className="pb-2 font-medium">内容</th><th className="pb-2 font-medium">状态</th><th className="pb-2 font-medium">尝试</th><th className="pb-2 font-medium">原因</th></tr></thead><tbody>{ops.failures.map(job => <tr key={job.id} className="border-b last:border-0"><td className="py-2">{job.scheduleDate} {job.pushTime}</td><td>{job.kind === "QUESTION" ? "答题" : job.kind === "KNOWLEDGE" ? "知识" : "资讯"}</td><td>{DELIVERY_STATUS_LABELS[job.status]}</td><td>{job.attempts}</td><td>{deliveryErrorLabel(job.lastErrorCode) || "等待处理"}</td></tr>)}</tbody></table>}
    </section>}
  </div>;
}
