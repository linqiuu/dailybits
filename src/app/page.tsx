import { BankExplorer } from "@/components/bank/bank-explorer";

export default function Home() {
  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold tracking-wide">
          探索题库
        </h1>
        <p className="text-muted-foreground">每日一题，温故知新</p>
      </header>
      <BankExplorer />
    </div>
  );
}
