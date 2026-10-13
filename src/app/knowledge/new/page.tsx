"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Building2, FileText, LockKeyhole, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, WorkbenchPanel } from "@/components/ui/workbench";

import { DepartmentSelector, type SelectedDepartment } from "@/components/bank/department-selector";

type Visibility = "PRIVATE" | "PUBLIC" | "PARTIAL";

const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "仅自己可见",
  PUBLIC: "公开",
  PARTIAL: "部分可见",
};

const VISIBILITY_SUMMARY: Record<Visibility, string> = {
  PRIVATE: "不会出现在其他人的发现页",
  PUBLIC: "登录员工都可以发现并订阅",
  PARTIAL: "仅添加的部门可见",
};

export default function NewKnowledgeBankPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [departments, setDepartments] = useState<SelectedDepartment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const titlePreview = title.trim() || "未命名知识库";
  const departmentSummary = useMemo(() => {
    if (visibility !== "PARTIAL") return VISIBILITY_SUMMARY[visibility];
    return departments.length ? departments.map(item => item.name).join("、") : "尚未选择部门";
  }, [departments, visibility]);


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("请输入知识库标题");
      return;
    }
    if (visibility === "PARTIAL" && departments.length === 0) {
      toast.error("部分可见时请至少添加一个部门");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge-banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          visibility,
          visibleDepartments:
            visibility === "PARTIAL" ? departments.map(item => item.id) : [],
          visibleDepartmentNames: visibility === "PARTIAL" ? departments.map(item => item.name) : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("创建成功");
      router.push(`/knowledge/${data.id}/edit`);
    } catch {
      toast.error("创建失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="创建知识库"
        description="把长文本、经验和技术点整理成适合每日推送的短知识卡片。"
        action={
          <Button type="submit" form="new-knowledge-form" disabled={submitting}>
            {submitting ? "创建中..." : "创建并添加知识点"}
          </Button>
        }
      />

      <form
        id="new-knowledge-form"
        onSubmit={handleSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <WorkbenchPanel className="space-y-5">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" aria-hidden />
              <h2 className="text-base font-semibold">基础信息</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <Label htmlFor="title">标题</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如 AI 工程每日知识"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>可见范围</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as Visibility)}
                >
                  <SelectTrigger>
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
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="这个知识库适合谁、主要推送什么"
                rows={4}
              />
            </div>
          </section>

          {visibility === "PARTIAL" ? (
            <section className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden />
                <h2 className="text-base font-semibold">部门范围</h2>
              </div>
              <DepartmentSelector value={departments} onChange={setDepartments} disabled={submitting} />
            </section>
          ) : null}
        </WorkbenchPanel>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <WorkbenchPanel className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold" title={titlePreview}>
                  {titlePreview}
                </h2>
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                  {description.trim() || "创建后可手动添加或 AI 生成知识卡片。"}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                新知识库
              </Badge>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2 rounded-[var(--radius)] bg-muted/55 px-3 py-2">
                <LockKeyhole className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">{VISIBILITY_LABELS[visibility]}</span>
              </div>
              <div className="flex items-center gap-2 rounded-[var(--radius)] bg-muted/55 px-3 py-2">
                <Users className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">{departmentSummary}</span>
              </div>
              <div className="flex items-center gap-2 rounded-[var(--radius)] bg-muted/55 px-3 py-2">
                <Brain className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">Markdown 知识卡片</span>
              </div>
            </div>
          </WorkbenchPanel>
        </aside>
      </form>
    </div>
  );
}
