import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CalendarClock, Check, Users } from "lucide-react";
import { Card } from "./card";

interface LearningCatalogCardProps {
  href: string;
  title: string;
  description?: string | null;
  creator: string;
  count: number;
  countLabel: string;
  subscribers: number;
  schedule: string;
  icon: ComponentType<{ className?: string; }>;
  tone?: "blue" | "teal";
  activity?: ReactNode;
  subscribed: boolean;
  action?: ReactNode;
}

export function LearningCatalogCard({
  href, title, description, creator, count, countLabel, subscribers, schedule,
  icon: Icon, tone = "blue", activity, subscribed, action,
}: LearningCatalogCardProps) {
  return (
    <Card className="learning-card" data-tone={tone}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="learning-mark"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="learning-title">
            <Link href={href} className="learning-link" title={title}>{title}</Link>
          </h2>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={creator}>{creator}</p>
        </div>
      </div>
      {description ? <p className="learning-description">{description}</p> : null}
      <div className="learning-meta">
        <span><strong>{count}</strong> {countLabel}</span>
        <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden /><strong>{subscribers}</strong> 人订阅</span>
      </div>
      {activity ? <div className="text-xs text-muted-foreground">{activity}</div> : null}
      <div className="learning-footer">
        <span className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground" title={schedule}>
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{schedule}</span>
        </span>
        <div className="learning-action">
          {subscribed ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" aria-hidden />已订阅</span> : action}
        </div>
      </div>
    </Card>
  );
}
