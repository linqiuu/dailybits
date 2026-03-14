"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, SkipForward, Trash2 } from "lucide-react";

const inputBottomLine =
  "border-0 border-b rounded-none focus-visible:ring-0 focus-visible:border-primary";

const OPTIONS_KEYS = ["A", "B", "C", "D"] as const;

interface Question {
  id: string;
  content: string;
  options: Record<string, string> | string[];
  correctAnswer: string;
  explanation: string;
  status: string;
}

interface ReviewPanelProps {
  bankId: string;
  onComplete?: () => void;
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

export function ReviewPanel({ bankId, onComplete }: ReviewPanelProps) {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [index, setIndex] = React.useState(0);
  const [content, setContent] = React.useState("");
  const [options, setOptions] = React.useState<Record<string, string>>({
    A: "",
    B: "",
    C: "",
    D: "",
  });
  const [correctAnswer, setCorrectAnswer] = React.useState("A");
  const [explanation, setExplanation] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const current = questions[index];
  const currentId = current?.id;

  const fetchDrafts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/questions?status=DRAFT`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setQuestions(data.questions ?? []);
      setIndex(0);
    } catch {
      toast.error("加载草稿失败");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  React.useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  React.useEffect(() => {
    if (current) {
      setContent(current.content);
      setOptions(toOptionsRecord(current.options));
      setCorrectAnswer(current.correctAnswer ?? "A");
      setExplanation(current.explanation ?? "");
    }
  }, [current]);

  const saveAndNext = async (action: "publish" | "skip" | "delete") => {
    if (!currentId) return;
    setBusy(true);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/questions/${currentId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("删除失败");
        toast.success("已删除");
      } else if (action === "publish") {
        const opts = {
          A: options.A?.trim() ?? "",
          B: options.B?.trim() ?? "",
          C: options.C?.trim() ?? "",
          D: options.D?.trim() ?? "",
        };
        const res = await fetch(`/api/questions/${currentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: content.trim(),
            options: opts,
            correctAnswer: correctAnswer.trim(),
            explanation: explanation.trim(),
            status: "PUBLISHED",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "发布失败");
        }
        toast.success("已发布");
      }
      const nextIndex = index + 1;
      if (nextIndex >= questions.length) {
        toast.success("全部审核完成");
        fetchDrafts();
        if (questions.length <= 1) onComplete?.();
      } else {
        setIndex(nextIndex);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    if (index + 1 >= questions.length) {
      toast.info("已是最后一题");
      return;
    }
    setIndex((i) => i + 1);
  };

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm font-serif">加载中...</p>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center font-serif">
        <p className="text-muted-foreground">暂无待审核的草稿题目</p>
        <Button variant="outline" className="mt-4" onClick={onComplete}>
          完成
        </Button>
      </div>
    );
  }

  const progress = ((index + 1) / questions.length) * 100;

  return (
    <div className="space-y-6 font-serif">
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>审核进度</span>
          <span>
            {index + 1} / {questions.length}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-2">
          <Label>题目内容</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={inputBottomLine}
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <Label>选项</Label>
          <div className="grid gap-3">
            {OPTIONS_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-6 text-sm font-medium text-muted-foreground">
                  {key}.
                </span>
                <Input
                  value={options[key] ?? ""}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className={inputBottomLine}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>正确答案</Label>
          <Select
            value={correctAnswer}
            onValueChange={(v) => setCorrectAnswer(v ?? "A")}
          >
            <SelectTrigger className={`w-32 ${inputBottomLine}`}>
              <SelectValue placeholder="选择" />
            </SelectTrigger>
            <SelectContent>
              {OPTIONS_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>解析</Label>
          <Textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className={inputBottomLine}
            rows={3}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveAndNext("delete")}
          disabled={busy}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
          删除
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkip}
            disabled={busy || index + 1 >= questions.length}
          >
            <SkipForward className="size-4" />
            跳过
          </Button>
          <Button
            size="sm"
            onClick={() => saveAndNext("publish")}
            disabled={busy}
          >
            <Check className="size-4" />
            通过
          </Button>
        </div>
      </div>
    </div>
  );
}
