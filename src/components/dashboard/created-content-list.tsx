"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Eye, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestState } from "@/components/ui/request-state";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type Visibility = "PRIVATE" | "PUBLIC" | "PARTIAL";

interface CreatedQuestionBank {
  id: string;
  title: string;
  description: string | null;
  subscriberCount: number;
  answerCount?: number;
  correctAnswerCount?: number;
  answererCount?: number;
  visibility: Visibility;
  updatedAt: string;
  _count: { questions: number };
}

interface CreatedKnowledgeBank {
  id: string;
  title: string;
  description: string | null;
  subscriberCount: number;
  visibility: Visibility;
  updatedAt: string;
  _count: { points: number };
}

interface ApiResponse<T> {
  banks?: T[];
  total?: number;
  totalPages?: number;
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "私密",
  PUBLIC: "公开",
  PARTIAL: "部分可见",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hasBanks<T>(value: ApiResponse<T> | { error?: string }): value is ApiResponse<T> {
  return Array.isArray((value as ApiResponse<T>).banks);
}

export function CreatedContentList() {
  const [questionBanks, setQuestionBanks] = useState<CreatedQuestionBank[]>([]);
  const [knowledgeBanks, setKnowledgeBanks] = useState<CreatedKnowledgeBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [questionPage, setQuestionPage] = useState(1);
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [activeTab, setActiveTab] = useState("question-banks");
  const [reload, setReload] = useState(0);
  const [counts, setCounts] = useState({ questions: 0, knowledge: 0, questionPages: 1, knowledgePages: 1 });

  useEffect(() => {
    let cancelled = false;

    async function loadCreatedContent() {
      setLoading(true);
      try {
        const [questionRes, knowledgeRes] = await Promise.all([
          fetch(`/api/banks?owner=mine&page=${questionPage}`),
          fetch(`/api/knowledge-banks?owner=mine&page=${knowledgePage}`),
        ]);
        const [questionData, knowledgeData] = await Promise.all([
          questionRes.json(),
          knowledgeRes.json(),
        ]);

        if (cancelled) return;
        if (!questionRes.ok || !knowledgeRes.ok) {
          setFailed(true);
          return;
        }
        setQuestionBanks(hasBanks<CreatedQuestionBank>(questionData) ? questionData.banks ?? [] : []);
        setKnowledgeBanks(
          hasBanks<CreatedKnowledgeBank>(knowledgeData) ? knowledgeData.banks ?? [] : [],
        );
        setCounts({ questions: questionData.total ?? 0, knowledge: knowledgeData.total ?? 0, questionPages: questionData.totalPages || 1, knowledgePages: knowledgeData.totalPages || 1 });
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => void loadCreatedContent(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [questionPage, knowledgePage, reload]);

  const totalCount = useMemo(
    () => counts.questions + counts.knowledge,
    [counts],
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <h2 className="panel-title text-lg">我创建的</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map((item) => (
            <Card key={item} className="animate-pulse">
              <CardContent className="space-y-3 pt-6">
                <div className="h-5 w-40 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-8 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (failed) {
    return (
      <section className="space-y-4">
        <h2 className="panel-title text-lg">我创建的</h2>
        <RequestState
          title="创建内容加载失败"
          onRetry={() => setReload(value => value + 1)}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="panel-title text-lg">我创建的</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {totalCount} 个内容库
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid h-10 w-full max-w-sm grid-cols-2 gap-1 p-1">
          <TabsTrigger value="question-banks" className="h-8 min-w-0 px-3">
            题库 {counts.questions}
          </TabsTrigger>
          <TabsTrigger value="knowledge-banks" className="h-8 min-w-0 px-3">
            知识库 {counts.knowledge}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="question-banks">
          {questionBanks.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {questionBanks.map((bank, index) => (
                <CreatedItemCard
                  key={bank.id}
                  title={bank.title}
                  description={bank.description}
                  icon="question"
                  itemCountLabel={`${bank._count.questions} 题`}
                  subscriberCount={bank.subscriberCount}
                  answerCount={bank.answerCount ?? 0}
                  correctAnswerCount={bank.correctAnswerCount ?? 0}
                  answererCount={bank.answererCount ?? 0}
                  visibility={bank.visibility}
                  updatedAt={bank.updatedAt}
                  viewHref={`/bank/${bank.id}`}
                  editHref={`/bank/${bank.id}/edit`}
                  appearDelayMs={index * 60}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="还没有创建题库"
              description="创建题库后会显示在这里。"
              illustration="book"
              action={{ label: "创建题库", href: "/bank/new" }}
            />
          )}
          <CreatedPager page={questionPage} pages={counts.questionPages} onChange={setQuestionPage} />
        </TabsContent>

        <TabsContent value="knowledge-banks">
          {knowledgeBanks.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {knowledgeBanks.map((bank, index) => (
                <CreatedItemCard
                  key={bank.id}
                  title={bank.title}
                  description={bank.description}
                  icon="knowledge"
                  itemCountLabel={`${bank._count.points} 张知识卡`}
                  subscriberCount={bank.subscriberCount}
                  visibility={bank.visibility}
                  updatedAt={bank.updatedAt}
                  viewHref={`/knowledge/${bank.id}`}
                  editHref={`/knowledge/${bank.id}/edit`}
                  appearDelayMs={index * 60}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="还没有创建知识库"
              description="创建知识库后会显示在这里。"
              illustration="book"
              action={{ label: "创建知识库", href: "/knowledge/new" }}
            />
          )}
          <CreatedPager page={knowledgePage} pages={counts.knowledgePages} onChange={setKnowledgePage} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CreatedPager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return <div className="mt-4 flex items-center justify-end gap-3">
    <span className="text-xs text-muted-foreground">{page} / {pages}</span>
    <Button variant="outline" size="icon-sm" title="上一页" aria-label="上一页创建内容" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="size-4" /></Button>
    <Button variant="outline" size="icon-sm" title="下一页" aria-label="下一页创建内容" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight className="size-4" /></Button>
  </div>;
}

function CreatedItemCard({
  title,
  description,
  icon,
  itemCountLabel,
  subscriberCount,
  answerCount = 0,
  correctAnswerCount = 0,
  answererCount = 0,
  visibility,
  updatedAt,
  viewHref,
  editHref,
  appearDelayMs,
}: {
  title: string;
  description: string | null;
  icon: "question" | "knowledge";
  itemCountLabel: string;
  subscriberCount: number;
  answerCount?: number;
  correctAnswerCount?: number;
  answererCount?: number;
  visibility: Visibility;
  updatedAt: string;
  viewHref: string;
  editHref: string;
  appearDelayMs: number;
}) {
  const Icon = icon === "question" ? BookOpen : BookMarked;
  const formattedDate = formatDate(updatedAt);
  const accuracy = answerCount > 0
    ? Math.round((correctAnswerCount / answerCount) * 1000) / 10
    : 0;

  return (
    <Card
      className="content-card paper-rise card-hover"
      style={{ animationDelay: `${appearDelayMs}ms` }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Icon className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="truncate text-base font-semibold" title={title}>
                {title}
              </CardTitle>
              {description ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">
            {VISIBILITY_LABELS[visibility]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{itemCountLabel}</Badge>
          <Badge variant="secondary" className="gap-1">
            <Users className="size-3" />
            {subscriberCount} 人订阅过
          </Badge>
          {icon === "question" ? (
            <>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3" />
                {answererCount} 人答题
              </Badge>
              <Badge variant="outline">
                {answerCount} 次，正确率 {accuracy}%
              </Badge>
            </>
          ) : null}
          {formattedDate ? (
            <Badge variant="outline">更新 {formattedDate}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={viewHref} />}
            nativeButton={false}
          >
            <Eye className="size-3.5" />
            查看
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={editHref} />}
            nativeButton={false}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
