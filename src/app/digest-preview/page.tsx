"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  GitFork,
  Github,
  Lightbulb,
  MessageCircle,
  Newspaper,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DigestKind = "knowledge" | "github" | "news" | "paper";

interface Metric {
  icon: ComponentType<{ className?: string }>;
  label: string;
}

interface DigestItem {
  title: string;
  meta?: string;
  summary: string;
  insight?: string;
  metrics?: Metric[];
  linkLabel?: string;
}

interface DigestPage {
  eyebrow: string;
  title: string;
  lead?: string;
  sections?: Array<{
    label: string;
    body?: string;
    bullets?: string[];
  }>;
  items?: DigestItem[];
  actions?: string[];
}

interface DigestDeck {
  id: DigestKind;
  sender: string;
  time: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  pages: DigestPage[];
}

const digestDecks: DigestDeck[] = [
  {
    id: "knowledge",
    sender: "学习助手",
    time: "09:00",
    label: "每日AI知识",
    icon: Brain,
    tone: "bg-[#2f4b66] text-white",
    pages: [
      {
        eyebrow: "知识卡 1/3",
        title: "RAG 不是把文档塞给大模型",
        lead: "今天的问题：为什么同样接入知识库，有的机器人回答仍然像在编？",
        sections: [
          {
            label: "一句话",
            body: "RAG 的核心不是“检索到了东西”，而是把正确、少量、可引用的上下文交给模型。",
          },
          {
            label: "常见误区",
            body: "只做向量搜索，不做重排、去重和引用约束，模型仍然会把相似但无关的片段讲得很自信。",
          },
        ],
        actions: ["看解析", "举例子", "出一题"],
      },
      {
        eyebrow: "知识卡 2/3",
        title: "拆开看：一个可落地的 RAG 流程",
        sections: [
          {
            label: "三个关键动作",
            bullets: [
              "召回：先找可能相关的片段，不追求一步到位。",
              "重排：把更贴近问题、更新、更可信的内容放前面。",
              "生成：要求模型只基于上下文回答，并给出处或“不确定”。",
            ],
          },
          {
            label: "AI点评",
            body: "如果你的知识库问答经常答偏，优先查召回质量和上下文拼接，而不是急着换更大的模型。",
          },
        ],
        actions: ["收藏", "变式题", "继续"],
      },
      {
        eyebrow: "知识卡 3/3",
        title: "今天的小练习",
        lead: "如果检索结果有 3 条互相冲突，应该直接都塞给模型吗？",
        sections: [
          {
            label: "参考答案",
            body: "不建议直接塞。更稳的做法是先按来源、时间、权限、相关性排序，必要时让模型显式说明冲突，并提示用户需要确认哪份文档为准。",
          },
          {
            label: "可生成互动",
            body: "用户回复“为什么”时，让 AI 用一个公司报销制度冲突的例子再解释一遍。",
          },
        ],
        actions: ["我懂了", "再讲浅一点", "下次提醒"],
      },
    ],
  },
  {
    id: "github",
    sender: "项目侦察员",
    time: "09:10",
    label: "GitHub Trending",
    icon: Github,
    tone: "bg-[#263238] text-white",
    pages: [
      {
        eyebrow: "Trending 1/3",
        title: "今日值得先看的 2 个项目",
        items: [
          {
            title: "browser-use / web-ui",
            meta: "TypeScript",
            summary: "把浏览器自动化能力封装成可视化工作台，适合做网页任务代理和内部运营工具。",
            insight: "AI点评：不是只看 star，重点看它是否有稳定的任务日志、失败重试和人工接管入口。",
            metrics: [
              { icon: Star, label: "31.8k" },
              { icon: TrendingUp, label: "今日 +1,240" },
              { icon: GitFork, label: "3.2k" },
            ],
            linkLabel: "查看仓库",
          },
          {
            title: "modelcontextprotocol / servers",
            meta: "Python / TypeScript",
            summary: "集中维护常用 MCP server，让模型可以连接文件、数据库、浏览器和各种工具。",
            insight: "AI点评：适合关注“让机器人真正办事”的同学，价值在生态和标准化，不在单个 demo。",
            metrics: [
              { icon: Star, label: "18.4k" },
              { icon: TrendingUp, label: "今日 +680" },
              { icon: GitFork, label: "2.1k" },
            ],
            linkLabel: "查看仓库",
          },
        ],
        actions: ["换一页", "只看AI项目", "生成实践任务"],
      },
      {
        eyebrow: "Trending 2/3",
        title: "再看 2 个偏工程落地的项目",
        items: [
          {
            title: "langchain-ai / open-swe",
            meta: "Python",
            summary: "面向软件工程任务的 Agent 框架，强调代码修改、评审和执行闭环。",
            insight: "AI点评：适合拿来研究工程代理的任务拆解方式，但别直接等同于生产可用。",
            metrics: [
              { icon: Star, label: "9.6k" },
              { icon: TrendingUp, label: "今日 +420" },
            ],
            linkLabel: "查看仓库",
          },
          {
            title: "unslothai / unsloth",
            meta: "Python",
            summary: "降低微调门槛，面向想本地训练或压缩模型成本的开发者。",
            insight: "AI点评：如果团队没有稳定数据集，先别急着微调，先把评测和数据清洗补齐。",
            metrics: [
              { icon: Star, label: "42.2k" },
              { icon: TrendingUp, label: "今日 +510" },
            ],
            linkLabel: "查看仓库",
          },
        ],
        actions: ["收藏本页", "生成对比", "继续"],
      },
      {
        eyebrow: "Trending 3/3",
        title: "今天的选择建议",
        sections: [
          {
            label: "如果只看一个",
            body: "优先看 browser-use / web-ui。它更容易从“看热闹”变成“本周能做个内部 demo”。",
          },
          {
            label: "可追加的 AI 能力",
            body: "让机器人根据 README 自动产出：适合人群、落地难度、和之前推送项目的差异，而不是只总结项目介绍。",
          },
        ],
        actions: ["生成周末项目", "对比昨日项目", "不感兴趣"],
      },
    ],
  },
  {
    id: "news",
    sender: "AI新闻雷达",
    time: "09:20",
    label: "AI 新闻",
    icon: Newspaper,
    tone: "bg-[#526e3f] text-white",
    pages: [
      {
        eyebrow: "新闻 1/2",
        title: "今天先看影响最大的 2 条",
        items: [
          {
            title: "某模型发布新的长上下文版本",
            meta: "模型能力",
            summary: "更新重点在更长输入、更稳定的代码理解，以及更低的批处理成本。",
            insight: "影响解读：文档问答、代码库检索和客服知识库会更容易降本；但长上下文仍然不能替代检索质量。",
            linkLabel: "看原文",
          },
          {
            title: "主流云厂商上线 Agent 托管能力",
            meta: "开发平台",
            summary: "平台开始把工具调用、状态管理、日志和权限做成托管能力。",
            insight: "影响解读：小团队可以少造基础设施，但要关注审计、数据边界和供应商锁定。",
            linkLabel: "看原文",
          },
        ],
        actions: ["解释影响", "关联历史", "继续"],
      },
      {
        eyebrow: "新闻 2/2",
        title: "AI 给你的判断",
        sections: [
          {
            label: "今天的主线",
            body: "行业不是只在拼模型参数，而是在把“模型 + 工具 + 记忆 + 权限 + 评测”打包成更完整的应用平台。",
          },
          {
            label: "对你的项目",
            body: "新闻可以加，但不要和 GitHub 混在一起。保留独立订阅，让用户自己选择；卡片里只保留“发生了什么”和“有什么影响”。",
          },
        ],
        actions: ["生成一题", "展开背景", "订阅同类"],
      },
    ],
  },
  {
    id: "paper",
    sender: "论文速读",
    time: "09:40",
    label: "arXiv AI 论文",
    icon: FileText,
    tone: "bg-[#8a3b33] text-white",
    pages: [
      {
        eyebrow: "论文 1/2",
        title: "今天适合工程同学看的 2 篇",
        items: [
          {
            title: "Evaluating Long-Context Language Models",
            meta: "cs.CL · 2026-05-08",
            summary: "论文关注长上下文模型在真实检索、推理和定位任务里的表现差异。",
            insight: "AI速读：适合用来设计知识库评测集，尤其是多文档冲突和细粒度引用场景。",
            linkLabel: "看摘要",
          },
          {
            title: "Tool-Augmented Agents with Verifiable Plans",
            meta: "cs.AI · 2026-05-08",
            summary: "提出让 Agent 在执行前生成可验证计划，并在工具结果后修正路线。",
            insight: "AI速读：和你的推送机器人有关，后续可以把“计划、执行、复盘”做成可见的学习链路。",
            linkLabel: "看摘要",
          },
        ],
        actions: ["用白话讲", "生成应用场景", "继续"],
      },
      {
        eyebrow: "论文 2/2",
        title: "论文订阅是否要加？",
        sections: [
          {
            label: "建议",
            body: "可以加，但默认不要推给所有人。论文卡片最好面向“深度学习/算法/Agent 研究”订阅者，否则群里会显得偏硬。",
          },
          {
            label: "更好的做法",
            body: "每篇论文不追求完整摘要，只给：研究问题、方法关键词、可能用途、阅读门槛。用户点开后再看详细解释。",
          },
        ],
        actions: ["只看工程相关", "降低难度", "收藏论文"],
      },
    ],
  },
];

function MetricPill({ metric }: { metric: Metric }) {
  const Icon = metric.icon;

  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 text-xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {metric.label}
    </span>
  );
}

function FeedItem({ item }: { item: DigestItem }) {
  return (
    <article className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {item.title}
          </h3>
          {item.linkLabel ? (
            <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
        </div>
        {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
      </div>
      {item.metrics?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.metrics.map((metric) => (
            <MetricPill key={`${item.title}-${metric.label}`} metric={metric} />
          ))}
        </div>
      ) : null}
      <p className="text-[13px] leading-5 text-foreground/90">{item.summary}</p>
      {item.insight ? (
        <p className="rounded-md border-l-2 border-primary/55 bg-secondary/45 px-2.5 py-2 text-[13px] leading-5 text-foreground/90">
          {item.insight}
        </p>
      ) : null}
    </article>
  );
}

function MarkdownPage({ page }: { page: DigestPage }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
          {page.eyebrow}
        </p>
        <h2 className="text-base font-semibold leading-snug text-foreground">
          {page.title}
        </h2>
        {page.lead ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{page.lead}</p>
        ) : null}
      </div>

      {page.sections?.map((section) => (
        <section key={`${page.title}-${section.label}`} className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Lightbulb className="size-3.5 text-primary" aria-hidden />
            {section.label}
          </div>
          {section.body ? (
            <p className="text-[13px] leading-5 text-foreground/90">{section.body}</p>
          ) : null}
          {section.bullets?.length ? (
            <ul className="space-y-1">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-[13px] leading-5 text-foreground/90">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {page.items?.length ? (
        <div className="space-y-2">
          {page.items.map((item) => (
            <FeedItem key={item.title} item={item} />
          ))}
        </div>
      ) : null}

      {page.actions?.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {page.actions.map((action) => (
            <Badge key={action} variant="outline" className="h-6 rounded-md bg-card px-2">
              {action}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DigestBubble({
  deck,
  pageIndex,
  onPrevious,
  onNext,
}: {
  deck: DigestDeck;
  pageIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const Icon = deck.icon;
  const page = deck.pages[pageIndex];
  const hasMultiplePages = deck.pages.length > 1;

  return (
    <div className="flex gap-2">
      <div className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg", deck.tone)}>
        <Bot className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{deck.sender}</span>
          <span>{deck.time}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border/75 bg-card shadow-[0_8px_18px_rgba(44,48,54,0.08)]">
          <div className={cn("flex items-center justify-between gap-3 px-3 py-2", deck.tone)}>
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate text-sm font-semibold">{deck.label}</span>
            </div>
            <span className="text-xs opacity-85">
              {pageIndex + 1}/{deck.pages.length}
            </span>
          </div>
          <div className="min-h-[280px] p-3">
            <MarkdownPage page={page} />
          </div>
          {hasMultiplePages ? (
            <div className="flex items-center justify-between border-t border-border/70 bg-muted/35 px-2.5 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${deck.label} 上一页`}
                onClick={onPrevious}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="flex gap-1">
                {deck.pages.map((deckPage, index) => (
                  <span
                    key={deckPage.eyebrow}
                    className={cn(
                      "h-1.5 w-5 rounded-full transition-colors",
                      index === pageIndex ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${deck.label} 下一页`}
                onClick={onNext}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function DigestPreviewPage() {
  const initialPages = useMemo(
    () =>
      Object.fromEntries(
        digestDecks.map((deck) => [deck.id, 0]),
      ) as Record<DigestKind, number>,
    [],
  );
  const [pages, setPages] = useState<Record<DigestKind, number>>(initialPages);

  const turnPage = (deck: DigestDeck, direction: -1 | 1) => {
    setPages((current) => {
      const nextIndex =
        (current[deck.id] + direction + deck.pages.length) % deck.pages.length;
      return { ...current, [deck.id]: nextIndex };
    });
  };

  return (
    <div className="page-enter space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-wide">
            IM 推送卡片预览
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            知识点、GitHub、新闻、论文的紧凑卡片样例
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 rounded-md">
          <MessageCircle className="size-3" />
          Markdown Card
        </Badge>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="rounded-lg border border-border/70 bg-[#e9eef1] p-3 shadow-[0_10px_24px_rgba(44,48,54,0.08)]">
          <div className="mb-3 flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm shadow-sm">
            <span className="font-medium text-slate-700">AI 学习群</span>
            <span className="text-xs text-slate-500">今天</span>
          </div>
          <div className="space-y-4">
            {digestDecks.map((deck) => (
              <DigestBubble
                key={deck.id}
                deck={deck}
                pageIndex={pages[deck.id]}
                onPrevious={() => turnPage(deck, -1)}
                onNext={() => turnPage(deck, 1)}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-3 rounded-lg border border-border/70 bg-card p-4 text-sm shadow-[0_8px_20px_rgba(44,48,54,0.05)]">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            组合建议
          </div>
          <div className="space-y-3 text-[13px] leading-5 text-muted-foreground">
            <p>
              知识点适合做三页：先问问题，再给解释，最后给练习或互动入口。
            </p>
            <p>
              GitHub 保留 star 和总结，再追加 AI点评、适合人群、落地建议，价值会更明显。
            </p>
            <p>
              新闻和论文可以加，但应作为独立订阅；群用户自己选择后，再推更深的内容。
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <BookOpenCheck className="size-3.5 text-accent" aria-hidden />
              推荐信息结构
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              事实层：标题、来源、star、日期。判断层：AI点评、影响、适合谁。互动层：解析、变式、收藏、忽略。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
