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
    label: "答题练习",
    value: "banks",
    icon: BookOpenCheck,
  },
  {
    label: "知识卡片",
    value: "knowledge",
    icon: Brain,
  },
  {
    label: "资讯摘要",
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
  return (
    <div className="home-index page-enter">
      <section className="home-frame">
        <div className="home-command">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">
              发现
            </h1>
          </div>
          <div className="home-actions">
            <Button
              className="home-secondary-action"
              variant="outline"
              render={<Link href="/dashboard" />}
              nativeButton={false}
            >
              我的内容
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
