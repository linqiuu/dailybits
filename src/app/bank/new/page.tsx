"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const inputBottomLineClass =
  "border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0";

export default function NewBankPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("请输入题库标题");
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
