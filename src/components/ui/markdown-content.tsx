import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return <div className={cn("markdown-body", className)}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: props => <a href={props.href} target="_blank" rel="noopener noreferrer">{props.children}</a>,
    }}>{children}</Markdown>
  </div>;
}
