"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuestionForm } from "@/components/question/question-form";
import { QuestionList } from "@/components/question/question-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

const ACCEPT_EXCEL = ".xlsx,.csv";

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
      toast.success(`已成功导入 ${data.count ?? 0} 道题目`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-serif">
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

function UrlParsePanel({
  bankId,
  onSuccess,
}: {
  bankId: string;
  onSuccess?: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [count, setCount] = React.useState(10);
  const [loading, setLoading] = React.useState(false);

  const handleGenerate = async () => {
    if (!url.trim()) {
      toast.error("请输入网页 URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/generate/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "解析失败");
      }
      toast.success(`已成功生成 ${data.count ?? 0} 道题目`);
      setUrl("");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-serif">
      <div className="space-y-2">
        <Label htmlFor="url-input">网页 URL</Label>
        <Input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          disabled={loading}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="url-count-select">题目数量</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
            disabled={loading}
          >
            <SelectTrigger id="url-count-select" className="w-24">
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
          {loading ? "正在解析网页，AI 生成中..." : "解析并生成"}
        </Button>
      </div>
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
      toast.success(`已成功生成 ${data.count ?? 0} 道题目`);
      setText("");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-serif">
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
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listRefreshKey, setListRefreshKey] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState("manual");

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
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {bank.title}
        </h1>
        <Link
          href={`/bank/${bankId}`}
          className="text-sm text-primary hover:underline"
        >
          返回题库
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="manual" className="flex-1">
            手动录入
          </TabsTrigger>
          <TabsTrigger value="file" className="flex-1">
            文件上传
          </TabsTrigger>
          <TabsTrigger value="url" className="flex-1">
            URL 解析
          </TabsTrigger>
          <TabsTrigger value="text" className="flex-1">
            AI 文本生成
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex-1">
            题目管理
          </TabsTrigger>
        </TabsList>
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
        <TabsContent value="url" className="mt-6">
          {isCreator ? (
            <UrlParsePanel
              bankId={bankId}
              onSuccess={handleGenerateSuccess}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可解析 URL
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
