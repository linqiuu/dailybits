import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SkeletonCard() {
  return (
    <Card>
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

export function SkeletonCardGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
