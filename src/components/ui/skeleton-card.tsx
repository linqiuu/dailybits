import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SkeletonCard() {
  return (
    <Card className="min-h-[218px]" aria-hidden="true">
      <CardHeader>
        <div className="h-5 w-3/4 rounded bg-secondary animate-pulse" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-4 w-1/2 rounded bg-secondary animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-secondary animate-pulse" />
        <div className="mt-3 h-8 w-20 rounded bg-secondary animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function SkeletonCardGrid({ catalog = false }: { catalog?: boolean }) {
  return (
    <div className={catalog ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-4 md:grid-cols-2"} role="status" aria-label="内容加载中">
      {(catalog ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4]).map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
