import { SkeletonCardGrid } from "@/components/ui/skeleton-card";

export default function Loading() {
  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <div className="h-9 w-32 rounded bg-secondary animate-pulse" />
        <div className="h-5 w-48 rounded bg-secondary/70 animate-pulse" />
      </header>
      <div className="space-y-6">
        <div className="h-10 w-full max-w-sm rounded bg-secondary/50 animate-pulse" />
        <SkeletonCardGrid />
      </div>
    </div>
  );
}
