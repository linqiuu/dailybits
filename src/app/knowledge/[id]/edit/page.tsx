"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DEFAULT_KNOWLEDGE_CARD_PROMPT } from "@/lib/llm/prompts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type BankVisibility = "PRIVATE" | "PUBLIC" | "PARTIAL";

interface KnowledgePoint {
  id: string;
  content: string;
  orderIndex: number;
}

interface KnowledgeBank {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  visibility: BankVisibility;
  visibleDepartments: string[];
  generationPrompt: string | null;
  points: KnowledgePoint[];
}

interface DraftPoint {
  id: string;
  content: string;
}

const VISIBILITY_LABELS: Record<BankVisibility, string> = {
  PRIVATE: "仅自己可见",
  PUBLIC: "公开",
  PARTIAL: "部分可见",
};

function createDraftPoint(): DraftPoint {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content: "",
  };
}

export default function EditKnowledgeBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bankId } = React.use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [bank, setBank] = React.useState<KnowledgeBank | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("manual");
  const [draftPoints, setDraftPoints] = React.useState<DraftPoint[]>([
    createDraftPoint(),
  ]);
  const [sourceText, setSourceText] = React.useState("");
  const [count, setCount] = React.useState(8);
  const [prompt, setPrompt] = React.useState(DEFAULT_KNOWLEDGE_CARD_PROMPT);
  const [promptEditing, setPromptEditing] = React.useState(false);
  const [promptExpanded, setPromptExpanded] = React.useState(false);
  const [savingPrompt, setSavingPrompt] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, string>>({});
  const [editVisibility, setEditVisibility] =
    React.useState<BankVisibility>("PRIVATE");
  const [editDepartments, setEditDepartments] = React.useState<string[]>([]);
  const [deptDraft, setDeptDraft] = React.useState("");
  const [savingVisibility, setSavingVisibility] = React.useState(false);

  const isCreator =
    !!session?.user?.id && !!bank && bank.creatorId === session.user.id;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge-banks/${bankId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "加载失败");
        router.push("/");
        return;
      }
      setBank(data);
      setPrompt(data.generationPrompt || DEFAULT_KNOWLEDGE_CARD_PROMPT);
      setEditVisibility(data.visibility ?? "PRIVATE");
      setEditDepartments(
        Array.isArray(data.visibleDepartments) ? data.visibleDepartments : [],
      );
      setEditing(
        Object.fromEntries(
          (data.points ?? []).map((point: KnowledgePoint) => [
            point.id,
            point.content,
          ]),
        ),
      );
    } catch {
      toast.error("加载失败");
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [bankId, router]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const addDepartment = () => {
    const value = deptDraft.trim();
    if (!value) return;
    if (editDepartments.includes(value)) {
      toast.error("该部门已添加");
      return;
    }
    setEditDepartments((prev) => [...prev, value]);
    setDeptDraft("");
  };

  const saveVisibility = async () => {
    if (!bank) return;
    if (editVisibility === "PARTIAL" && editDepartments.length === 0) {
      toast.error("部分可见时请至少添加一个部门");
      return;
    }
    setSavingVisibility(true);
    try {
      const res = await fetch(`/api/knowledge-banks/${bankId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: editVisibility,
          visibleDepartments:
            editVisibility === "PARTIAL" ? editDepartments : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success("可见范围已更新");
      setBank((prev) =>
        prev
          ? {
              ...prev,
              visibility: data.visibility ?? editVisibility,
              visibleDepartments: Array.isArray(data.visibleDepartments)
                ? data.visibleDepartments
                : editDepartments,
            }
          : prev,
      );
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingVisibility(false);
    }
  };

  const createPoints = async (contents: string[]) => {
    if (contents.length === 0) {
      toast.error("没有可保存的知识点");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/knowledge-banks/${bankId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success(`已添加 ${data.count ?? contents.length} 条知识点`);
      setDraftPoints([createDraftPoint()]);
      await refresh();
      setActiveTab("manage");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const generateFromText = async () => {
    if (!sourceText.trim()) {
      toast.error("请先粘贴长文本");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/knowledge-banks/${bankId}/generate/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText.trim(), count, prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "生成失败");
        return;
      }
      toast.success(`已生成 ${data.count ?? 0} 条知识点`);
      setSourceText("");
      await refresh();
      setActiveTab("manage");
    } catch {
      toast.error("生成失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const savePrompt = async (nextPrompt?: string | null) => {
    const promptToSave = nextPrompt === undefined ? prompt : nextPrompt;
    if (promptToSave !== null && !promptToSave.trim()) {
      toast.error("提示词不能为空");
      return;
    }
    setSavingPrompt(true);
    try {
      const res = await fetch(`/api/knowledge-banks/${bankId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationPrompt: promptToSave === null ? "" : promptToSave.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      const savedPrompt = promptToSave === null ? null : promptToSave.trim();
      setPrompt(savedPrompt || DEFAULT_KNOWLEDGE_CARD_PROMPT);
      setBank((prev) =>
        prev ? { ...prev, generationPrompt: savedPrompt } : prev,
      );
      setPromptEditing(false);
      setPromptExpanded(false);
      toast.success(savedPrompt ? "生成提示词已保存" : "已切换为系统默认提示词");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingPrompt(false);
    }
  };

  const updatePoint = async (point: KnowledgePoint) => {
    const content = editing[point.id]?.trim();
    if (!content) {
      toast.error("知识点内容不能为空");
      return;
    }
    try {
      const res = await fetch(`/api/knowledge-points/${point.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success("已保存");
      await refresh();
    } catch {
      toast.error("保存失败，请稍后重试");
    }
  };

  const deletePoint = async (point: KnowledgePoint) => {
    if (!confirm("确定删除这条知识点吗？")) return;
    try {
      const res = await fetch(`/api/knowledge-points/${point.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      await refresh();
    } catch {
      toast.error("删除失败，请稍后重试");
    }
  };

  if (loading) {
    return (
      <div className="page-enter flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bank) return null;

  const manualContents = draftPoints
    .map((point) => point.content.trim())
    .filter(Boolean);

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold text-foreground">
              {bank.title}
            </h1>
            <Badge variant="secondary">{bank.points.length} 条</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            维护适合 IM 每日推送的 Markdown 知识卡片。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/knowledge/${bankId}`} />}
          nativeButton={false}
        >
          返回知识库
        </Button>
      </div>

      <div className="max-w-5xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
          <TabsList variant="line" className="h-auto w-full flex-wrap gap-1 py-1">
            <TabsTrigger value="manual" className="min-w-[6rem] flex-1">
              添加知识点
            </TabsTrigger>
            <TabsTrigger value="ai" className="min-w-[6rem] flex-1">
              AI 生成
            </TabsTrigger>
            <TabsTrigger value="manage" className="min-w-[6rem] flex-1">
              管理
              <Badge variant="secondary" className="ml-1">
                {bank.points.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-6">
            {isCreator ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <Label>Markdown 知识卡片</Label>
                    <p className="text-xs text-muted-foreground">
                      每一列会保存为一条知识点，支持标题、列表、代码块等 Markdown。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraftPoints((prev) => [...prev, createDraftPoint()])
                    }
                  >
                    <Plus className="size-4" />
                    添加一条
                  </Button>
                </div>

                <div className="space-y-3">
                  {draftPoints.map((point, index) => (
                    <div
                      key={point.id}
                      className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_2.25rem]"
                    >
                      <div className="flex items-center justify-between gap-2 sm:block">
                        <Badge variant="secondary">#{index + 1}</Badge>
                        <p className="mt-0 hidden text-xs text-muted-foreground sm:mt-2 sm:block">
                          卡片
                        </p>
                        {draftPoints.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="删除这条草稿"
                            className="sm:hidden"
                            onClick={() =>
                              setDraftPoints((prev) =>
                                prev.filter((item) => item.id !== point.id),
                              )
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      <Textarea
                        value={point.content}
                        onChange={(event) =>
                          setDraftPoints((prev) =>
                            prev.map((item) =>
                              item.id === point.id
                                ? { ...item, content: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder={
                          "### Agent Memory 不只是聊天记录\n\n很多人把 memory 理解成保存历史对话，但更有价值的是把成功经验沉淀成可复用步骤。推送时可以只讲一个判断：哪些信息值得长期记忆，哪些只适合作为本轮上下文。"
                        }
                        className="min-h-[150px] resize-y font-mono text-sm"
                      />
                      {draftPoints.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除这条草稿"
                          className="hidden sm:inline-flex"
                          onClick={() =>
                            setDraftPoints((prev) =>
                              prev.filter((item) => item.id !== point.id),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-3 py-3">
                  <Button
                    onClick={() => createPoints(manualContents)}
                    disabled={submitting || manualContents.length === 0}
                  >
                    {submitting ? "提交中..." : "提交知识点"}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    将保存 {manualContents.length} 条
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                仅知识库创建者可添加知识点
              </p>
            )}
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            {isCreator ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="source-text">
                      粘贴文章、笔记、README 或课程文本
                    </Label>
                    <Textarea
                      id="source-text"
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      placeholder="AI 会把长文本整理成多张适合 IM 推送的 Markdown 知识卡片。"
                      className="min-h-[320px] resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 px-3 py-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="count">生成数量</Label>
                      <Input
                        id="count"
                        type="number"
                        min={1}
                        max={50}
                        value={count}
                        onChange={(event) =>
                          setCount(
                            Math.max(1, Math.min(50, Number(event.target.value) || 1)),
                          )
                        }
                        className="w-28"
                      />
                    </div>
                    <Button onClick={generateFromText} disabled={submitting}>
                      <Sparkles className="size-4" />
                      {submitting ? "生成中..." : "AI 生成知识点"}
                    </Button>
                  </div>
                </div>

                <aside className="space-y-3 rounded-lg border bg-card p-4 xl:self-start">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="knowledge-prompt">生成提示词</Label>
                      <Badge variant="secondary">
                        {bank.generationPrompt ? "自定义" : "系统默认"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={promptExpanded ? "收起提示词" : "展开提示词"}
                      onClick={() => setPromptExpanded((value) => !value)}
                    >
                      {promptExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                  </div>

                  {promptEditing ? (
                    <Textarea
                      id="knowledge-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      className="min-h-[320px] resize-y font-mono text-xs"
                    />
                  ) : (
                    <div
                      className={`whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed ${
                        promptExpanded ? "max-h-[360px] overflow-auto" : "max-h-28 overflow-hidden"
                      }`}
                    >
                      {prompt}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {promptEditing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => savePrompt()}
                          disabled={savingPrompt}
                        >
                          {savingPrompt ? "保存中..." : "永久保存"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPrompt(bank.generationPrompt || DEFAULT_KNOWLEDGE_CARD_PROMPT);
                            setPromptEditing(false);
                          }}
                          disabled={savingPrompt}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPromptExpanded(true);
                          setPromptEditing(true);
                        }}
                      >
                        编辑
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => savePrompt(null)}
                      disabled={savingPrompt}
                    >
                      <RotateCcw className="size-3.5" />
                      系统默认
                    </Button>
                  </div>
                </aside>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                仅知识库创建者可使用 AI 生成
              </p>
            )}
          </TabsContent>

          <TabsContent value="manage" className="mt-6">
            {isCreator ? (
              <div className="space-y-3">
                <div className="space-y-3">
                  {bank.points.length === 0 ? (
                    <div className="rounded-lg border bg-card px-4 py-10 text-center text-muted-foreground">
                      暂无知识点，可以手动添加或从长文本 AI 生成。
                    </div>
                  ) : (
                    bank.points.map((point, index) => (
                      <div key={point.id} className="rounded-lg border bg-card p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Badge variant="secondary">#{index + 1}</Badge>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deletePoint(point)}
                          >
                            <Trash2 className="size-3.5" />
                            删除
                          </Button>
                        </div>
                        <Textarea
                          value={editing[point.id] ?? ""}
                          onChange={(event) =>
                            setEditing((prev) => ({
                              ...prev,
                              [point.id]: event.target.value,
                            }))
                          }
                          className="min-h-[150px] resize-y font-mono text-sm"
                        />
                        <Button
                          size="sm"
                          className="mt-3"
                          onClick={() => updatePoint(point)}
                        >
                          保存修改
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <section className="mt-6 border-t pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-medium text-foreground">
                          权限设置
                        </h2>
                        <Badge variant="secondary">
                          {VISIBILITY_LABELS[editVisibility]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        控制谁可以浏览和订阅这个知识库。
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={saveVisibility}
                      disabled={savingVisibility}
                      className="w-full sm:w-auto"
                    >
                      {savingVisibility ? "保存中..." : "保存权限"}
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="space-y-2 sm:w-56">
                      <Label>可见范围</Label>
                      <Select
                        value={editVisibility}
                        onValueChange={(value) =>
                          setEditVisibility(value as BankVisibility)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="仅自己可见">
                            {VISIBILITY_LABELS[editVisibility]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRIVATE">仅自己可见</SelectItem>
                          <SelectItem value="PUBLIC">公开</SelectItem>
                          <SelectItem value="PARTIAL">部分可见</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editVisibility === "PARTIAL" && (
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label>可访问部门</Label>
                        <div className="flex gap-2">
                          <Input
                            value={deptDraft}
                            onChange={(event) => setDeptDraft(event.target.value)}
                            placeholder="部门名称"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addDepartment();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={addDepartment}
                          >
                            添加
                          </Button>
                        </div>
                        {editDepartments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {editDepartments.map((department) => (
                              <Badge
                                key={department}
                                variant="secondary"
                                className="cursor-pointer font-normal"
                                onClick={() =>
                                  setEditDepartments((prev) =>
                                    prev.filter((item) => item !== department),
                                  )
                                }
                              >
                                {department} x
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                仅知识库创建者可管理知识点
              </p>
            )}
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
