import { cn } from "@/lib/utils";

export function SignalBars({ values, className }: { values: number[]; className?: string }) {
  return (
    <div className={cn("signal-bars", className)} aria-hidden="true">
      {values.map((value, index) => (
        <span key={index} style={{ height: `${Math.max(18, Math.min(100, value))}%` }} />
      ))}
    </div>
  );
}
