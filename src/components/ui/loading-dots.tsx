import { cn } from "@/lib/utils";

interface LoadingDotsProps {
  className?: string;
}

export function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-hidden
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-[loadingDot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-[loadingDot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-[loadingDot_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: "0.4s" }}
      />
    </span>
  );
}
