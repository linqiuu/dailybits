"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/client-auth";
import { AuthenticationState } from "@/components/authentication-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/workbench";
import { RequestState } from "@/components/ui/request-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Kind = "AI_NEWS" | "GITHUB_TRENDING" | "KNOWLEDGE";
interface Preview { title?: string; digestDate?: string; pages: string[]; fetchedAt?: string; banks?: Array<{ id: string; title: string }>; selectedBankId?: string; }
const labels: Record<Kind, string> = { AI_NEWS: "AI 新闻", GITHUB_TRENDING: "GitHub 热榜", KNOWLEDGE: "知识卡片" };

export default function DigestPreviewPage() {
  const { status } = useSession();
  const [kind, setKind] = useState<Kind>("AI_NEWS");
  const [bankId, setBankId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setFailed(false);
      const query = new URLSearchParams({ kind });
      if (kind === "KNOWLEDGE" && bankId) query.set("bankId", bankId);
      fetch(`/api/digest/preview?${query}`, { signal: controller.signal, cache: "no-store" })
        .then(response => { if (!response.ok) throw new Error("Unavailable"); return response.json(); })
        .then(data => { if (!controller.signal.aborted) { setPreview(data); setIndex(0); } })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [status, kind, bankId, reload]);
  if (status !== "authenticated") return <AuthenticationState />;
  return <div className="space-y-6 page-enter">
    <PageHeader title="推送卡片预览" />
    <div className="flex items-center justify-between gap-4">
      <Tabs value={kind} onValueChange={value => setKind(value as Kind)}>
        <TabsList>{(Object.keys(labels) as Kind[]).map(value => <TabsTrigger value={value} key={value}>{labels[value]}</TabsTrigger>)}</TabsList>
      </Tabs>
      {kind === "KNOWLEDGE" && !!preview?.banks?.length && <Select value={bankId || preview.selectedBankId} onValueChange={value => setBankId(value || "")}><SelectTrigger aria-label="选择知识库" className="w-64"><SelectValue placeholder="选择知识库" /></SelectTrigger><SelectContent>{preview.banks.map(bank => <SelectItem value={bank.id} key={bank.id}>{bank.title}</SelectItem>)}</SelectContent></Select>}
    </div>
    {loading ? <RequestState title="正在加载卡片" loading /> : failed ? <RequestState title="卡片暂时加载失败" onRetry={() => setReload(value => value + 1)} /> : !preview?.pages.length ? <EmptyState title={kind === "KNOWLEDGE" ? "暂无可预览的知识卡片" : "本期摘要尚未生成"} description={kind === "KNOWLEDGE" ? "先在知识库中添加内容。" : "首次获取摘要后，这里会展示实际推送的卡片。"} variant="compact" /> : <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{preview.digestDate || preview.title}</span>
        <span>{preview.fetchedAt ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(preview.fetchedAt)) : ""}</span>
      </div>
      <section className="preview-card min-h-[300px] p-6" aria-live="polite" aria-atomic="true">
        <MarkdownContent className="animate-in fade-in duration-150" key={index}>{preview.pages[index]}</MarkdownContent>
      </section>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{index + 1} / {preview.pages.length}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" aria-label="上一页" title="上一页" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon-sm" aria-label="下一页" title="下一页" disabled={index === preview.pages.length - 1} onClick={() => setIndex(value => value + 1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </div>}
  </div>;
}
