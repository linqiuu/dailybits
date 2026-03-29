"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { QuestionForm, type EditingQuestion } from "@/components/question/question-form";
import { toast } from "sonner";
import { Pencil, Trash2, Send, ClipboardCopy } from "lucide-react";
import { cn } from "@/lib/utils";

type QuestionStatus = "DRAFT" | "PUBLISHED";

interface Question {
  id: string;
  content: string;
  options: Record<string, string> | string[];
  correctAnswer: string;
  explanation: string;
  status: QuestionStatus;
  createdAt?: string;
}

interface QuestionListProps {
  bankId: string;
  isCreator: boolean;
}

function toOptionsRecord(opts: Record<string, string> | string[] | unknown): Record<string, string> {
  if (!opts) return { A: "", B: "", C: "", D: "" };
  if (Array.isArray(opts)) {
    return { A: opts[0] ?? "", B: opts[1] ?? "", C: opts[2] ?? "", D: opts[3] ?? "" };
  }
  if (typeof opts === "object") {
    const o = opts as Record<string, string>;
    return {
      A: o.A ?? "",
      B: o.B ?? "",
      C: o.C ?? "",
      D: o.D ?? "",
    };
  }
  return { A: "", B: "", C: "", D: "" };
}

function truncate(str: string, len = 50) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

export function QuestionList({ bankId, isCreator }: QuestionListProps) {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "DRAFT" | "PUBLISHED">("all");
  const [editing, setEditing] = React.useState<EditingQuestion | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = React.useState(false);
  const [batchDeleting, setBatchDeleting] = React.useState(false);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  const fetchQuestions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/questions`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } catch {
      toast.error("加载题目列表失败");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  React.useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [filter]);

  const filtered = React.useMemo(() => {
    const base =
      filter === "all" ? [...questions] : questions.filter((q) => q.status === filter);
    if (filter !== "all") return base;
    return base.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "DRAFT" ? -1 : 1;
      }
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [questions, filter]);

  React.useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    const allSelected =
      filtered.length > 0 && filtered.every((q) => selectedIds.has(q.id));
    const someSelected = filtered.some((q) => selectedIds.has(q.id));
    el.indeterminate = someSelected && !allSelected;
  }, [filtered, selectedIds]);

  const draftIds = React.useMemo(
    () => questions.filter((q) => q.status === "DRAFT").map((q) => q.id),
    [questions]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/questions/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast.success("已删除");
      setDeleteId(null);
      fetchQuestions();
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchPublish = async () => {
    if (draftIds.length === 0) {
      toast.info("没有可发布的草稿");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/questions/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: draftIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "发布失败");
      }
      const data = await res.json();
      toast.success(`已发布 ${data.updated ?? 0} 道题目`);
      fetchQuestions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyJson = async () => {
    if (filtered.length === 0) {
      toast.info("当前列表为空");
      return;
    }
    const payload = filtered.map((q) => ({
      content: q.content,
      options: toOptionsRecord(q.options),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  const toggleSelectAll = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((q) => selectedIds.has(q.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((q) => q.id)));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/questions/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "批量删除失败");
      }
      const deleted = typeof data.deleted === "number" ? data.deleted : ids.length;
      toast.success(`已删除 ${deleted} 道题目`);
      setBatchDeleteOpen(false);
      setSelectedIds(new Set());
      fetchQuestions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setBatchDeleting(false);
    }
  };

  const toEditing = (q: Question): EditingQuestion => ({
    id: q.id,
    content: q.content,
    options: toOptionsRecord(q.options),
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  });

  if (!isCreator) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList variant="line">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="DRAFT">草稿</TabsTrigger>
            <TabsTrigger value="PUBLISHED">已发布</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <ClipboardCopy className="size-4" />
            复制 JSON
          </Button>
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setBatchDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              批量删除 ({selectedIds.size})
            </Button>
          )}
          {draftIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchPublish}
              disabled={publishing}
            >
              <Send className="size-4" />
              批量发布 ({draftIds.length})
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无题目</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-10 px-2 py-2 text-center font-medium">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((q) => selectedIds.has(q.id))
                    }
                    onChange={toggleSelectAll}
                    aria-label="全选当前列表"
                  />
                </th>
                <th className="px-4 py-2 text-left font-medium w-12">#</th>
                <th className="px-4 py-2 text-left font-medium">题目</th>
                <th className="px-4 py-2 text-left font-medium w-24">状态</th>
                <th className="px-4 py-2 text-right font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => (
                <tr
                  key={q.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-primary/5",
                    i % 2 === 0 ? "bg-card" : "bg-secondary/25"
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleSelected(q.id)}
                      aria-label={`选择题目 ${i + 1}`}
                    />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <span
                      className={cn(
                        "inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold",
                        i % 2 === 0 ? "bg-primary/12 text-primary" : "bg-accent/12 text-accent"
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-2">{truncate(q.content)}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={q.status === "DRAFT" ? "secondary" : "default"}
                      className={
                        q.status === "PUBLISHED"
                          ? "bg-[var(--success)] text-white border-0"
                          : ""
                      }
                    >
                      {q.status === "DRAFT" ? "草稿" : "已发布"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(toEditing(q))}
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">编辑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(q.id)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">删除</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑题目</DialogTitle>
          </DialogHeader>
          {editing && (
            <QuestionForm
              bankId={bankId}
              editingQuestion={editing}
              onSuccess={() => {
                setEditing(null);
                fetchQuestions();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">确定要删除这道题目吗？此操作不可撤销。</p>
          <DialogFooter showCloseButton>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDeleteOpen} onOpenChange={(o) => !o && setBatchDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定删除已选中的 {selectedIds.size} 道题目吗？此操作不可撤销。
          </p>
          <DialogFooter showCloseButton>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={batchDeleting}
            >
              {batchDeleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
