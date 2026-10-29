import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  ChevronDown,
  Newspaper,
  Plus,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { BankExplorer } from "@/components/bank/bank-explorer";
import { DigestSubscriptionList } from "@/components/dashboard/digest-subscription-list";
import { KnowledgeExplorer } from "@/components/knowledge/knowledge-explorer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const channels = [
  {
    label: "题库",
    value: "banks",
    icon: BookOpenCheck,
  },
  {
    label: "知识卡",
    value: "knowledge",
    icon: Brain,
  },
  {
    label: "AI 资讯",
    value: "digests",
    icon: Newspaper,
  },
];

const creationLinks = [
  {
    href: "/bank/new",
    icon: UploadCloud,
    title: "创建题库",
    detail: "上传 Excel、粘贴 JSON，或用 AI 从文本生成题目。",
  },
  {
    href: "/knowledge/new",
    icon: Brain,
    title: "创建知识库",
    detail: "整理短知识点，之后按用户选择的时间推送。",
  },
  {
    href: "/digest-preview",
    icon: Newspaper,
    title: "预览推送卡片",
    detail: "查看新闻、热榜和知识卡片在 IM 里的页面效果。",
  },
];

export default function Home() {
  const today = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date());

  return (
    <div className="home-index page-enter">
      <section className="home-frame">
        <div className="home-command">
          <div className="min-w-0">
            <h1 className="home-title">
              今天学点什么？
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              从团队共享的题库、知识卡与 AI 动态里，挑一份加入你的学习节奏。
            </p>
          </div>
          <div className="home-actions">
            <span className="home-date" aria-label={`今天是 ${today}`}>{today}</span>
            <Button
              className="home-secondary-action"
              variant="outline"
              render={<Link href="/dashboard" />}
              nativeButton={false}
            >
              我的学习
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button className="home-primary-action" />}>
                <Plus className="size-4" aria-hidden />
                创建
                <ChevronDown className="size-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {creationLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href}>
                      <Link
                        href={item.href}
                        className="flex w-full items-center gap-2"
                        aria-label={`${item.title}：${item.detail}`}
                        title={item.detail}
                      >
                        <Icon className="size-4" aria-hidden />
                        {item.title}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs defaultValue="banks" className="home-workspace">
          <div className="home-channel-rail">
            <TabsList className="home-channel-list">
            {channels.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="home-channel-tab"
                >
                  <span className="home-channel-icon">
                    <Icon className="size-4 shrink-0" aria-hidden />
                  </span>
                  <span className="truncate">{item.label}</span>
                </TabsTrigger>
              );
            })}
            </TabsList>
            <span className="hidden text-xs font-medium text-muted-foreground lg:block">
              选择内容，查看详情后订阅
            </span>
          </div>

          <div className="home-feed-panel">
            <TabsContent value="banks" className="home-panel">
              <BankExplorer showCreate={false} emptyVariant="compact" layout="list" />
            </TabsContent>
            <TabsContent value="knowledge" className="home-panel">
              <KnowledgeExplorer showCreate={false} emptyVariant="compact" layout="list" />
            </TabsContent>
            <TabsContent value="digests" className="home-panel">
              <DigestSubscriptionList />
            </TabsContent>
          </div>
        </Tabs>
      </section>
    </div>
  );
}
