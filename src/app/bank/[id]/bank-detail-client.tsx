"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookOpenCheck, MessageSquareText, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CommentSection } from "@/components/bank/comment-section";
import { WorkbenchPanel } from "@/components/ui/workbench";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnswerRecords } from "@/components/bank/answer-records";
import type { SubscriptionCadence, SubscriptionScheduleMode } from "@/types";

const QUESTIONS_PER_PAGE = 30;

interface BankDetailClientProps {
  bank: {
    id: string;
    title: string;
    description: string | null;
    creatorId: string;
    subscriberCount: number;
    subscriptionScheduleMode: SubscriptionScheduleMode;
    subscriptionCadence: SubscriptionCadence;
    subscriptionWeekdays: number[];
    subscriptionPushTimes: string[];
    creator: { id: string; name: string | null; image: string | null; uid?: string | null };
    questions: Array<{
      id: string;
      content: string;
      status: string;
    }>;
    questionCount: number;
  };
  isCreator: boolean;
  canViewAnswers?: boolean;
  subscriptionSlot?: React.ReactNode;
}

export function BankDetailClient({ bank, isCreator, canViewAnswers = false, subscriptionSlot }: BankDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [questionPage, setQuestionPage] = useState(1);

  const totalQuestionPages = Math.ceil(bank.questions.length / QUESTIONS_PER_PAGE);
  const paginatedQuestions = bank.questions.slice(
    (questionPage - 1) * QUESTIONS_PER_PAGE,
    questionPage * QUESTIONS_PER_PAGE
  );

  async function handleDelete() {
    if (!confirm("确定要删除此题库吗？此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("删除失败，请稍后重试");
    }
  }

  return (
    <>
      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <WorkbenchPanel className="editor-hero" padded={false}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 p-0">
            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold">{bank.title}</h1>
                {bank.description ? (
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {bank.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-md">
                  <BookOpenCheck className="size-3" />
                  {bank.questionCount} 题
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  <Users className="size-3" />
                  {bank.subscriberCount} 人订阅过
                </Badge>
                <Badge variant="outline" className="rounded-md">
                  创建者 {bank.creator.name ?? "未知"}
                  {bank.creator.uid ? ` (${bank.creator.uid})` : ""}
                </Badge>
              </div>
            </div>
            {isCreator ? (
              <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                className=""
                render={<Link href={`/bank/${bank.id}/edit`} />}
                nativeButton={false}
              >
                  <Pencil className="size-3.5" />
                  编辑
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              </div>
            ) : null}
          </CardHeader>
        </WorkbenchPanel>

        {subscriptionSlot}
      </section>

      <Tabs defaultValue={canViewAnswers && searchParams.get("tab") === "answers" ? "answers" : "questions"} className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="questions">题目列表</TabsTrigger>
          {canViewAnswers && <TabsTrigger value="answers">答题记录</TabsTrigger>}
        </TabsList>
        <TabsContent value="questions">
      <Card className="content-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpenCheck className="size-4 text-primary" />
            题目列表
            {bank.questions.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                共 {bank.questions.length} 题
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bank.questions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无题目，添加题目后将在此展示
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left font-medium">序号</th>
                      <th className="pb-2 text-left font-medium">内容</th>
                      <th className="pb-2 text-left font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedQuestions.map((q, i) => (
                      <tr key={q.id} className="border-b last:border-0">
                        <td className="py-3">
                          {(questionPage - 1) * QUESTIONS_PER_PAGE + i + 1}
                        </td>
                        <td className="py-3 text-muted-foreground line-clamp-2">
                          {q.content}
                        </td>
                        <td className="py-3">{q.status === "PUBLISHED" ? "已发布" : "草稿"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalQuestionPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuestionPage((p) => Math.max(1, p - 1))}
                    disabled={questionPage <= 1}
                  >
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {questionPage} / {totalQuestionPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuestionPage((p) => Math.min(totalQuestionPages, p + 1))}
                    disabled={questionPage >= totalQuestionPages}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

        </TabsContent>
        {canViewAnswers && <TabsContent value="answers"><AnswerRecords bankId={bank.id} /></TabsContent>}
      </Tabs>
      <Card className="content-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareText className="size-4 text-primary" />
            评论区
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CommentSection bankId={bank.id} canModerate={isCreator} />
        </CardContent>
      </Card>
    </>
  );
}
