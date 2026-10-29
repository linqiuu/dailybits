import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <section className={cn("page-hero flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="panel-title text-lg">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface WorkbenchPanelProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

export function WorkbenchPanel({
  children,
  className,
  padded = true,
}: WorkbenchPanelProps) {
  return (
    <section className={cn("workbench-panel", padded && "p-4 sm:p-5", className)}>
      {children}
    </section>
  );
}

interface MetricLineProps {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "primary" | "accent" | "citrine" | "ink";
}

const toneClass: Record<NonNullable<MetricLineProps["tone"]>, string> = {
  primary: "text-primary",
  accent: "text-accent",
  citrine: "text-[color:var(--surface-citrine)]",
  ink: "text-foreground",
};

export function MetricLine({
  icon: Icon,
  label,
  value,
  detail,
  tone = "primary",
}: MetricLineProps) {
  return (
    <div className="metric-cell min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className={cn("size-3.5", toneClass[tone])} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-2 truncate text-2xl font-semibold", toneClass[tone])}>
        {value}
      </div>
      {detail ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}
