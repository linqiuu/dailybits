"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Visibility = "PRIVATE" | "PUBLIC" | "PARTIAL";

const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "仅自己可见",
  PUBLIC: "公开",
  PARTIAL: "部分可见",
};

const inputBottomLineClass =
  "border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0";

export default function NewBankPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [visibleDepartments, setVisibleDepartments] = useState<string[]>([]);
  const [deptInput, setDeptInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("请输入题库标题");
      return;
    }
    if (visibility === "PARTIAL" && visibleDepartments.length === 0) {
      toast.error("部分可见时请至少添加一个部门");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          visibility,
          visibleDepartments:
            visibility === "PARTIAL" ? visibleDepartments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("创建成功");
      router.push(`/bank/${data.id}`);
    } catch {
      toast.error("创建失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-enter">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="font-serif text-xl">创建题库</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">标题（必填）</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入题库标题"
                className={inputBottomLineClass}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">描述（选填）</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入题库描述"
                className={inputBottomLineClass}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>可见范围</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as Visibility)}
              >
                <SelectTrigger className={inputBottomLineClass}>
                  <SelectValue placeholder="仅自己可见">
                    {VISIBILITY_LABELS[visibility]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">仅自己可见</SelectItem>
                  <SelectItem value="PUBLIC">公开</SelectItem>
                  <SelectItem value="PARTIAL">部分可见</SelectItem>
                </SelectContent>
              </Select>
              {visibility === "PARTIAL" && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    指定可访问的部门名称（需与用户侧部门匹配）
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={deptInput}
                      onChange={(e) => setDeptInput(e.target.value)}
                      placeholder="部门名称"
                      className={inputBottomLineClass}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = deptInput.trim();
                          if (v && !visibleDepartments.includes(v)) {
                            setVisibleDepartments((d) => [...d, v]);
                            setDeptInput("");
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const v = deptInput.trim();
                        if (!v) return;
                        if (visibleDepartments.includes(v)) {
                          toast.error("该部门已添加");
                          return;
                        }
                        setVisibleDepartments((d) => [...d, v]);
                        setDeptInput("");
                      }}
                    >
                      添加
                    </Button>
                  </div>
                  {visibleDepartments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {visibleDepartments.map((d) => (
                        <Badge
                          key={d}
                          variant="secondary"
                          className="cursor-pointer font-normal"
                          onClick={() =>
                            setVisibleDepartments((prev) => prev.filter((x) => x !== d))
                          }
                        >
                          {d} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
