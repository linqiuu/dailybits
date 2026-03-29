import { MessageCircle } from "lucide-react";
import { BankExplorer } from "@/components/bank/bank-explorer";

export default function Home() {
  const groupChatId = process.env.GROUP_CHAT_ID?.trim();

  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold tracking-wide">
          探索题库
        </h1>
        <p className="text-muted-foreground">每日一题，温故知新</p>
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
      <BankExplorer />
    </div>
  );
}
