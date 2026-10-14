"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuestionForm } from "@/components/question/question-form";
import { QuestionList } from "@/components/question/question-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/client-auth";
import { toast } from "sonner";
import { CalendarClock, FileJson2, ShieldCheck } from "lucide-react";
import {
  DepartmentSelector,
  type SelectedDepartment,
} from "@/components/bank/department-selector";
import {
  SubscriptionScheduleForm,
  defaultScheduleDraft,
  type ScheduleDraft,
} from "@/components/bank/subscription-schedule-form";

const ACCEPT_EXCEL = ".xlsx,.csv";

type BankVisibility = "PRIVATE" | "PUBLIC" | "PARTIAL";

const VISIBILITY_LABELS: Record<BankVisibility, string> = {
  PRIVATE: "仅自己可见",
  PUBLIC: "全部员工可见",
  PARTIAL: "指定部门可见",
};

const JSON_IMPORT_EXAMPLE = `[
  {
    "content": "题目内容",
    "options": { "A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D" },
    "correctAnswer": "A",
    "explanation": "解析内容"
  }
]`;

function validateImportQuestion(
  item: unknown,
  indexLabel: string
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, error: `${indexLabel} 必须是对象` };
  }
  const o = item as Record<string, unknown>;
  const { content, options, correctAnswer, explanation } = o;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: `${indexLabel}：缺少或无效的 content` };
  }
  if (options === undefined || options === null) {
    return { ok: false, error: `${indexLabel}：缺少 options` };
  }
  if (typeof options !== "object" || Array.isArray(options)) {
    return { ok: false, error: `${indexLabel}：options 必须是对象` };
  }
  if (typeof correctAnswer !== "string" || !correctAnswer.trim()) {
    return { ok: false, error: `${indexLabel}：缺少或无效的 correctAnswer` };
  }
  if (typeof explanation !== "string") {
    return { ok: false, error: `${indexLabel}：explanation 必须是字符串` };
  }
  return {
    ok: true,
    data: {
      content: content.trim(),
      options,
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim(),
    },
  };
}

function JsonImportPanel({
  bankId,
  onSuccess,
}: {
  bankId: string;
  onSuccess?: () => void;
}) {
  const [raw, setRaw] = React.useState("");
  const [showExample, setShowExample] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleImport = async () => {
    const text = raw.trim();
    if (!text) {
      toast.error("请粘贴 JSON");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error("JSON 格式无效");
      return;
    }
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : [parsed];
    const validated: Record<string, unknown>[] = [];
    for (let i = 0; i < items.length; i++) {
      const result = validateImportQuestion(items[i], `第 ${i + 1} 项`);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      validated.push(result.data);
    }
    if (validated.length === 0) {
      toast.error("没有可导入的题目");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "导入失败");
      }
      const count = typeof data.count === "number" ? data.count : validated.length;
      toast.success(`成功导入 ${count} 道题目`);
      setRaw("");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowExample((v) => !v)}
        >
          {showExample ? "隐藏样例" : "查看样例"}
        </Button>
      </div>
      {showExample && (
        <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          {JSON_IMPORT_EXAMPLE}
        </pre>
      )}
      <div className="space-y-2">
        <Label htmlFor="json-import-textarea">粘贴题目 JSON（单题对象或数组）</Label>
        <Textarea
          id="json-import-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="粘贴 JSON…"
          className="min-h-[220px] resize-y font-mono text-sm"
          disabled={loading}
        />
      </div>
      <Button onClick={handleImport} disabled={loading}>
        <FileJson2 className="mr-2 size-4" />
        {loading ? "导入中…" : "导入"}
      </Button>
    </div>
  );
}

function FileUploadPanel({
  bankId,
  onSuccess,
}: {
  bankId: string;
  onSuccess?: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [generatedCount, setGeneratedCount] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".csv"))) {
      setFile(f);
    } else {
      toast.error("仅支持 .xlsx 和 .csv 文件");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".csv"))) {
      setFile(f);
    } else if (f) {
      toast.error("仅支持 .xlsx 和 .csv 文件");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("请先选择文件");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/banks/${bankId}/generate/file`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "上传失败");
      }
      const n = data.count ?? 0;
      toast.success(`已生成 ${n} 道题目（草稿状态）`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setGeneratedCount(n);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setLoading(false);
    }
  };

  const handleGoPreview = () => {
    setGeneratedCount(null);
    onSuccess?.();
  };

  return (
    <div className="space-y-6">
      {generatedCount !== null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="text-foreground">
            已生成 {generatedCount} 道题目（草稿状态），请在「题目管理」中预览和发布。
          </p>
          <Button type="button" className="mt-3" size="sm" onClick={handleGoPreview}>
            前往预览
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          先下载模板填写题目，再上传导入，格式更稳定。
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<a href="/api/banks/template/excel" download />}
          nativeButton={false}
        >
          下载 Excel 模板
        </Button>
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_EXCEL}
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-muted-foreground text-sm">
          拖拽 .xlsx 或 .csv 文件到此处，或点击选择
        </p>
        {file && (
          <p className="mt-2 text-sm font-medium text-foreground">{file.name}</p>
        )}
      </div>
      <Button onClick={handleUpload} disabled={!file || loading}>
        {loading ? "正在导入..." : "上传并导入"}
      </Button>
    </div>
  );
}

function TextGeneratePanel({
  bankId,
  onSuccess,
}: {
  bankId: string;
  onSuccess?: () => void;
}) {
  const [text, setText] = React.useState("");
  const [count, setCount] = React.useState(10);
  const [loading, setLoading] = React.useState(false);
  const [generatedCount, setGeneratedCount] = React.useState<number | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error("请粘贴或输入文本内容");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/generate/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "生成失败");
      }
      const n = data.count ?? 0;
      toast.success(`已生成 ${n} 道题目（草稿状态）`);
      setText("");
      setGeneratedCount(n);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleGoPreview = () => {
    setGeneratedCount(null);
    onSuccess?.();
  };

  return (
    <div className="space-y-6">
      {generatedCount !== null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="text-foreground">
            已生成 {generatedCount} 道题目（草稿状态），请在「题目管理」中预览和发布。
          </p>
          <Button type="button" className="mt-3" size="sm" onClick={handleGoPreview}>
            前往预览
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="text-input">粘贴文本内容</Label>
        <Textarea
          id="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="将需要提取知识点的文本粘贴到此处..."
          className="min-h-[200px] resize-y"
          disabled={loading}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="count-select">题目数量</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
            disabled={loading}
          >
            <SelectTrigger id="count-select" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="15">15</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? "正在解析文本，AI 生成中..." : "AI 生成题目"}
        </Button>
      </div>
    </div>
  );
}

export default function EditBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bankId } = React.use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [bank, setBank] = React.useState<{
    id: string;
    title: string;
    creatorId: string;
    visibility: BankVisibility;
    visibleDepartments: string[];
    visibleDepartmentNames: string[];
    subscriptionScheduleMode: "CUSTOM" | "FIXED";
    subscriptionCadence: "DAILY" | "WEEKLY";
    subscriptionWeekdays: number[];
    subscriptionPushTimes: string[];
    recommendedSubscriptionMode: "CURRENT_EDITION" | "FOLLOW_UPDATES";
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listRefreshKey, setListRefreshKey] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState("manual");
  const [editVisibility, setEditVisibility] = React.useState<BankVisibility>("PRIVATE");
  const [editDepartments, setEditDepartments] = React.useState<SelectedDepartment[]>([]);
  const [editSchedule, setEditSchedule] = React.useState<ScheduleDraft>(defaultScheduleDraft);
  const [newScheduleTime, setNewScheduleTime] = React.useState("09:30");
  const [savingVisibility, setSavingVisibility] = React.useState(false);

  React.useEffect(() => {
    if (!bank) return;
    const timer = window.setTimeout(() => {
      setEditVisibility(bank.visibility);
      setEditDepartments(
        bank.visibleDepartments.map((id, index) => ({
          id,
          name: bank.visibleDepartmentNames[index] || id,
        })),
      );
      setEditSchedule({
        recommendedSubscriptionMode: bank.recommendedSubscriptionMode,
        subscriptionScheduleMode: bank.subscriptionScheduleMode,
        subscriptionCadence: bank.subscriptionCadence,
        subscriptionWeekdays: bank.subscriptionWeekdays,
        subscriptionPushTimes: bank.subscriptionPushTimes,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bank]);

  const handleGenerateSuccess = () => {
    setListRefreshKey((k) => k + 1);
    setActiveTab("manage");
  };

  React.useEffect(() => {
    fetch(`/api/banks/${bankId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
          router.push("/");
          return;
        }
        setBank(data);
      })
      .catch(() => {
        toast.error("加载失败");
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [bankId, router]);

  const isCreator =
    !!session?.user?.id && !!bank && bank.creatorId === session.user.id;

  const saveVisibility = async () => {
    if (!bank) return;
    if (editVisibility === "PARTIAL" && editDepartments.length === 0) {
      toast.error("部分可见时请至少添加一个部门");
      return;
    }
    setSavingVisibility(true);
    try {
      const res = await fetch(`/api/banks/${bankId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: editVisibility,
          visibleDepartments:
            editVisibility === "PARTIAL" ? editDepartments.map((item) => item.id) : [],
          visibleDepartmentNames:
            editVisibility === "PARTIAL" ? editDepartments.map((item) => item.name) : [],
          ...editSchedule,
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
                : editDepartments.map((item) => item.id),
              visibleDepartmentNames: Array.isArray(data.visibleDepartmentNames)
                ? data.visibleDepartmentNames
                : editDepartments.map((item) => item.name),
              subscriptionScheduleMode:
                data.subscriptionScheduleMode ?? editSchedule.subscriptionScheduleMode,
              recommendedSubscriptionMode: data.recommendedSubscriptionMode ?? editSchedule.recommendedSubscriptionMode ?? "CURRENT_EDITION",
              subscriptionCadence:
                data.subscriptionCadence ?? editSchedule.subscriptionCadence,
              subscriptionWeekdays: Array.isArray(data.subscriptionWeekdays)
                ? data.subscriptionWeekdays
                : editSchedule.subscriptionWeekdays,
              subscriptionPushTimes: Array.isArray(data.subscriptionPushTimes)
                ? data.subscriptionPushTimes
                : editSchedule.subscriptionPushTimes,
            }
          : prev
      );
    } catch {
      toast.error("保存失败");
    } finally {
      setSavingVisibility(false);
    }
  };

  if (loading) {
    return (
      <div className="page-enter flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bank) {
    return null;
  }

  return (
    <div className="page-enter space-y-6">
      <div className="editor-hero flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          {bank.title}
        </h1>
        <Link
          href={`/bank/${bankId}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          返回题库
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList variant="line" className="stream-toolbar h-auto w-full flex-wrap gap-1 p-1">
          <TabsTrigger value="settings" className="flex-1 min-w-[4.5rem]">
            设置
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex-1 min-w-[4.5rem]">
            手动录入
          </TabsTrigger>
          <TabsTrigger value="file" className="flex-1">
            文件上传
          </TabsTrigger>
          <TabsTrigger value="text" className="flex-1">
            AI 文本生成
          </TabsTrigger>
          <TabsTrigger value="json" className="flex-1">
            JSON 导入
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex-1 min-w-[4.5rem]">
            题目管理
          </TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-6">
          {isCreator ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="workbench-panel space-y-5 p-5">
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <h2 className="text-base font-semibold">访问范围</h2>
                  </div>
                  <div className="space-y-2">
                    <Label>可见范围</Label>
                    <Select
                      value={editVisibility}
                      onValueChange={(v) => setEditVisibility(v as BankVisibility)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="仅自己可见">
                          {VISIBILITY_LABELS[editVisibility]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIVATE">仅自己可见</SelectItem>
                        <SelectItem value="PUBLIC">全部员工可见</SelectItem>
                        <SelectItem value="PARTIAL">指定部门可见</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editVisibility === "PARTIAL" ? (
                    <DepartmentSelector
                      value={editDepartments}
                      onChange={setEditDepartments}
                      disabled={savingVisibility}
                    />
                  ) : null}
                </section>

                <section className="space-y-4 border-t border-border pt-5">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-primary" />
                    <h2 className="text-base font-semibold">订阅节奏</h2>
                  </div>
                  <SubscriptionScheduleForm
                    value={editSchedule}
                    onChange={setEditSchedule}
                    newTime={newScheduleTime}
                    onNewTimeChange={setNewScheduleTime}
                    disabled={savingVisibility}
                  />
                </section>

                <Button onClick={saveVisibility} disabled={savingVisibility}>
                  {savingVisibility ? "保存中..." : "保存设置"}
                </Button>
              </div>

              <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
                <div className="workbench-panel p-4">
                  <p className="text-sm font-semibold text-foreground">当前发布策略</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      {VISIBILITY_LABELS[editVisibility]}
                    </div>
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      {editVisibility === "PARTIAL"
                        ? editDepartments.map((item) => item.name).join("、") || "未选择部门"
                        : "无需部门限制"}
                    </div>
                    <div className="rounded-md bg-muted/50 px-3 py-2">
                      {editSchedule.subscriptionScheduleMode === "CUSTOM"
                        ? "订阅者自定义时间"
                        : `${editSchedule.subscriptionCadence === "DAILY" ? "每天" : "每周"}，${editSchedule.subscriptionPushTimes.join("、")}`}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">仅题库创建者可修改设置</p>
          )}
        </TabsContent>
        <TabsContent value="manual" className="mt-6">
          {isCreator ? (
            <QuestionForm
              bankId={bankId}
              onSuccess={() => setListRefreshKey((k) => k + 1)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可录入题目
            </p>
          )}
        </TabsContent>
        <TabsContent value="file" className="mt-6">
          {isCreator ? (
            <FileUploadPanel
              bankId={bankId}
              onSuccess={handleGenerateSuccess}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可导入文件
            </p>
          )}
        </TabsContent>
        <TabsContent value="text" className="mt-6">
          {isCreator ? (
            <TextGeneratePanel
              bankId={bankId}
              onSuccess={handleGenerateSuccess}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可使用 AI 生成
            </p>
          )}
        </TabsContent>
        <TabsContent value="json" className="mt-6">
          {isCreator ? (
            <JsonImportPanel
              bankId={bankId}
              onSuccess={() => setListRefreshKey((k) => k + 1)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可导入 JSON
            </p>
          )}
        </TabsContent>
        <TabsContent value="manage" className="mt-6">
          {isCreator ? (
            <QuestionList
              key={listRefreshKey}
              bankId={bankId}
              isCreator={isCreator}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可管理题目
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
