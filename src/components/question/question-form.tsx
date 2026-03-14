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

const inputBottomLine =
  "border-0 border-b rounded-none focus-visible:ring-0 focus-visible:border-primary";

const OPTIONS_KEYS = ["A", "B", "C", "D"] as const;

export interface EditingQuestion {
  id: string;
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
}

interface QuestionFormProps {
  bankId: string;
  onSuccess?: () => void;
  editingQuestion?: EditingQuestion;
}

export function QuestionForm({
  bankId,
  onSuccess,
  editingQuestion,
}: QuestionFormProps) {
  const [content, setContent] = React.useState(editingQuestion?.content ?? "");
  const [options, setOptions] = React.useState<Record<string, string>>(
    editingQuestion?.options ?? { A: "", B: "", C: "", D: "" }
  );
  const [correctAnswer, setCorrectAnswer] = React.useState<string>(
    editingQuestion?.correctAnswer ?? "A"
  );
  const [explanation, setExplanation] = React.useState(
    editingQuestion?.explanation ?? ""
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (editingQuestion) {
      setContent(editingQuestion.content);
      setOptions(editingQuestion.options ?? { A: "", B: "", C: "", D: "" });
      setCorrectAnswer(editingQuestion.correctAnswer ?? "A");
      setExplanation(editingQuestion.explanation ?? "");
    } else {
      setContent("");
      setOptions({ A: "", B: "", C: "", D: "" });
      setCorrectAnswer("A");
      setExplanation("");
    }
  }, [editingQuestion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("请输入题目内容");
      return;
    }
    const opts = {
      A: options.A?.trim() ?? "",
      B: options.B?.trim() ?? "",
      C: options.C?.trim() ?? "",
      D: options.D?.trim() ?? "",
    };
    if (!opts.A || !opts.B || !opts.C || !opts.D) {
      toast.error("请填写全部四个选项");
      return;
    }
    if (!correctAnswer || !opts[correctAnswer as keyof typeof opts]) {
      toast.error("请选择正确答案");
      return;
    }
    if (typeof explanation !== "string") {
      toast.error("请填写解析");
      return;
    }

    setSubmitting(true);
    try {
      if (editingQuestion) {
        const res = await fetch(`/api/questions/${editingQuestion.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: content.trim(),
            options: opts,
            correctAnswer: correctAnswer.trim(),
            explanation: explanation.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "更新失败");
        }
        toast.success("题目已更新");
      } else {
        const res = await fetch(`/api/banks/${bankId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: content.trim(),
            options: opts,
            correctAnswer: correctAnswer.trim(),
            explanation: explanation.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "创建失败");
        }
        toast.success("题目已创建");
        setContent("");
        setOptions({ A: "", B: "", C: "", D: "" });
        setCorrectAnswer("A");
        setExplanation("");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 font-serif">
      <div className="space-y-2">
        <Label htmlFor="content">题目内容</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请输入题目内容..."
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
                placeholder={`选项 ${key}`}
                className={inputBottomLine}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="correctAnswer">正确答案</Label>
        <Select
          value={correctAnswer}
          onValueChange={(v) => setCorrectAnswer(v ?? "A")}
        >
          <SelectTrigger
            id="correctAnswer"
            className={`w-32 ${inputBottomLine}`}
          >
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
        <Label htmlFor="explanation">解析</Label>
        <Textarea
          id="explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="请输入解析..."
          className={inputBottomLine}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "提交中..." : editingQuestion ? "更新题目" : "添加题目"}
      </Button>
    </form>
  );
}
