"use client";

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "./button";

export function RequestState({ title, description, loading = false, onRetry }: {
  title: string; description?: string; loading?: boolean; onRetry?: () => void;
}) {
  const Icon = loading ? LoaderCircle : AlertCircle;
  return (
    <div className="request-state" role={loading ? "status" : "alert"} aria-busy={loading}>
      <Icon className={loading ? "size-4 animate-spin text-muted-foreground" : "size-4 text-destructive"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="size-3.5" aria-hidden />重试</Button>}
    </div>
  );
}
