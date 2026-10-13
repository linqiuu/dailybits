import Link from "next/link";
import { BookOpen, Coffee, Library } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  illustration?: "book" | "tea" | "reader";
  action?: { label: string; href: string };
  variant?: "default" | "compact";
}

export function EmptyState({ title, description, illustration = "book", action, variant = "default" }: EmptyStateProps) {
  const Icon = illustration === "tea" ? Coffee : illustration === "reader" ? Library : BookOpen;
  return (
    <div className={cn("empty-slate flex items-center gap-3", variant === "compact" ? "py-4" : "py-8")}>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {action && <Button variant="outline" size="sm" render={<Link href={action.href} />} nativeButton={false}>{action.label}</Button>}
    </div>
  );
}
