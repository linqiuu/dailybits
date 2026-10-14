"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  SubscriptionPanel,
  type SubscriptionSummary,
} from "@/components/bank/subscription-panel";
import type { LearningSubscriptionMode } from "@/types";
import { WorkbenchPanel } from "@/components/ui/workbench";
import { startLogin } from "@/lib/client-auth";
import { paginateKnowledgePoints } from "@/lib/knowledge/pagination";

const KNOWLEDGE_POINTS_PER_PAGE = 20;

interface KnowledgeDetailClientProps {
  bank: {
    id: string;
    title: string;
    description: string | null;
    creatorId: string;
    subscriberCount: number;
    creator: {
      id: string;
      name: string | null;
      image: string | null;
      uid?: string | null;
    };
    points: Array<{ id: string; content: string }>;
    pointCount: number;
    recommendedSubscriptionMode: LearningSubscriptionMode;
  };
  isCreator: boolean;
  isLoggedIn: boolean;
  subscription: SubscriptionSummary | null;
  progress: { pointCount: number; pushedCount: number };
}

export function KnowledgeDetailClient({
  bank,
  isCreator,
  isLoggedIn,
  subscription,
  progress,
}: KnowledgeDetailClientProps) {
  const router = useRouter();
  const [pointPage, setPointPage] = useState(1);
  const paginatedPoints = paginateKnowledgePoints(
    bank.points,
    pointPage,
    KNOWLEDGE_POINTS_PER_PAGE,
  );

  const deleteBank = async () => {
    if (!confirm("确定要删除此知识库吗？此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/knowledge-banks/${bank.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("删除失败，请稍后重试");
    }
  };

  return (
    <div className="space-y-5">
      <WorkbenchPanel className="editor-hero" padded={false}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-0">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{bank.title}</h1>
            {bank.description ? (
              <p className="text-sm text-muted-foreground">
                {bank.description}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              创建者：{bank.creator.name ?? "未知"}
              {bank.creator.uid ? ` (${bank.creator.uid})` : ""}，
              {bank.pointCount} 条， {bank.subscriberCount} 人订阅过
            </p>
          </div>
          {isCreator ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/knowledge/${bank.id}/edit`} />}
                nativeButton={false}
              >
                编辑
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteBank}>
                删除
              </Button>
            </div>
          ) : null}
        </CardHeader>
      </WorkbenchPanel>

      {isLoggedIn ? (
        <SubscriptionPanel
          kind="KNOWLEDGE"
          bankId={bank.id}
          recommendedMode={bank.recommendedSubscriptionMode}
          bankSchedule={{
            subscriptionScheduleMode: "CUSTOM",
            subscriptionCadence: "DAILY",
            subscriptionWeekdays: [],
            subscriptionPushTimes: [],
          }}
          initialSubscription={subscription}
          totalQuestions={progress.pointCount}
          pushedCount={progress.pushedCount}
        />
      ) : (
        <Button onClick={startLogin}>登录后订阅</Button>
      )}

      <section>
        <CardHeader className="px-0">
          <h2 className="text-lg font-semibold">
            知识卡片列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              共 {bank.pointCount} 条
            </span>
          </h2>
        </CardHeader>
        <CardContent className="mt-4 space-y-3 px-0">
          {bank.points.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无知识卡片，创建者添加后即可推送
            </p>
          ) : (
            <>
              {paginatedPoints.items.map((point) => (
                <article
                  key={point.id}
                  className="max-w-4xl border-b py-4 last:border-0"
                >
                  <p className="mb-2 text-xs text-muted-foreground">
                    #{point.displayIndex}
                  </p>
                  <MarkdownContent>{point.content}</MarkdownContent>
                </article>
              ))}
              {paginatedPoints.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    第 {paginatedPoints.page} / {paginatedPoints.totalPages} 页
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPointPage((page) => Math.max(1, page - 1))
                      }
                      disabled={paginatedPoints.page <= 1}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPointPage((page) =>
                          Math.min(paginatedPoints.totalPages, page + 1),
                        )
                      }
                      disabled={
                        paginatedPoints.page >= paginatedPoints.totalPages
                      }
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </section>
    </div>
  );
}
