import { MessageCircle } from "lucide-react";
import { BankExplorer } from "@/components/bank/bank-explorer";
import { DigestSubscriptionList } from "@/components/dashboard/digest-subscription-list";
import { KnowledgeExplorer } from "@/components/knowledge/knowledge-explorer";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function Home() {
  const groupChatId = process.env.GROUP_CHAT_ID?.trim();

  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold tracking-wide">
          学习推送
        </h1>
        <p className="text-muted-foreground">
          订阅答题练习、知识卡片和资讯摘要，按你的节奏推送到 IM。
        </p>
      </header>
      {groupChatId ? (
        <div
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm shadow-[0_2px_8px_rgba(44,48,54,0.06)]"
          role="status"
        >
          <MessageCircle
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="text-muted-foreground">加入交流群</span>
          <span className="font-mono text-base font-semibold tracking-tight text-foreground">
            {groupChatId}
          </span>
        </div>
      ) : null}
      <Tabs defaultValue="banks" className="space-y-5">
        <TabsList className="grid h-10 w-full max-w-md grid-cols-3 gap-1 p-1">
          <TabsTrigger value="banks" className="h-8 min-w-0 px-3">
            答题练习
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="h-8 min-w-0 px-3">
            知识卡片
          </TabsTrigger>
          <TabsTrigger value="digests" className="h-8 min-w-0 px-3">
            资讯摘要
          </TabsTrigger>
        </TabsList>
        <TabsContent value="banks">
          <BankExplorer />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeExplorer />
        </TabsContent>
        <TabsContent value="digests">
          <DigestSubscriptionList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
