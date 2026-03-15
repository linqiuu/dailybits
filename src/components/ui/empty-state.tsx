import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  illustration?: "book" | "tea" | "reader";
  action?: { label: string; href: string };
}

function EmptyIllustration({ type }: { type: NonNullable<EmptyStateProps["illustration"]> }) {
  if (type === "tea") {
    return (
      <svg viewBox="0 0 160 96" className="h-20 w-32 text-primary/60" fill="none">
        <path d="M24 57h78a14 14 0 0 1 0 28H44a20 20 0 0 1-20-20V57Z" stroke="currentColor" strokeWidth="2.4" />
        <path d="M102 61h17c9 0 17 8 17 17s-8 17-17 17h-9" stroke="currentColor" strokeWidth="2.4" />
        <path d="M37 46h52" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M52 22c-5 8 5 10 0 18M72 20c-5 8 5 10 0 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "reader") {
    return (
      <svg viewBox="0 0 160 96" className="h-20 w-32 text-accent/80" fill="none">
        <circle cx="48" cy="24" r="10" stroke="currentColor" strokeWidth="2.4" />
        <path d="M35 60c0-10 7-18 17-18s17 8 17 18v24H35V60Z" stroke="currentColor" strokeWidth="2.4" />
        <path d="M78 40l40-7a8 8 0 0 1 9 8v35a8 8 0 0 1-6 7l-40 9a6 6 0 0 1-7-6V46a6 6 0 0 1 4-6Z" stroke="currentColor" strokeWidth="2.4" />
        <path d="M90 52l26-4M90 64l26-4M90 76l16-3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 160 96" className="h-20 w-32 text-primary/65" fill="none">
      <path d="M18 25a10 10 0 0 1 10-10h44a20 20 0 0 1 20 20v42a6 6 0 0 1-6 6H34a16 16 0 0 1-16-16V25Z" stroke="currentColor" strokeWidth="2.4" />
      <path d="M142 25a10 10 0 0 0-10-10H88a20 20 0 0 0-20 20v42a6 6 0 0 0 6 6h52a16 16 0 0 0 16-16V25Z" stroke="currentColor" strokeWidth="2.4" />
      <path d="M80 35v44" stroke="currentColor" strokeWidth="2.4" />
      <path d="M36 43h32M36 53h24M92 43h32M92 53h22" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  illustration = "book",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-4 py-12 text-center shadow-[0_10px_26px_rgba(44,48,54,0.06)]">
      <EmptyIllustration type={illustration} />
      <h3 className="mt-2 font-serif text-xl font-medium tracking-wide text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
