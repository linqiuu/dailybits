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
import { Pencil, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type QuestionStatus = "DRAFT" | "PUBLISHED";

interface Question {
  id: string;
  content: string;
  options: Record<string, string> | string[];
  correctAnswer: string;
  explanation: string;
  status: QuestionStatus;
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

  const filtered = React.useMemo(() => {
    if (filter === "all") return questions;
    return questions.filter((q) => q.status === filter);
  }, [questions, filter]);

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

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无题目</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
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
    </div>
  );
}
