"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type SortMode = "latest" | "likes";

type CommentUser = {
  id: string;
  name: string | null;
  image: string | null;
  uid?: string | null;
};

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  user: CommentUser;
  _count: { replies: number };
  isLiked?: boolean;
};

function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function userInitial(name: string | null, uid?: string | null): string {
  const s = (name?.trim() || uid?.trim() || "?").slice(0, 1);
  return s.toUpperCase();
}

function displayName(user: CommentUser): string {
  return user.name?.trim() || user.uid?.trim() || "匿名用户";
}

type CommentSectionProps = {
  bankId: string;
  canModerate?: boolean;
};

export function CommentSection({ bankId, canModerate = false }: CommentSectionProps) {
  const { data: session, status } = useSession();
  const currentUserId = session?.user?.id;
  const loggedIn = status === "authenticated" && !!currentUserId;

  const [sort, setSort] = useState<SortMode>("latest");
  const [page, setPage] = useState(1);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [topContent, setTopContent] = useState("");
  const [submittingTop, setSubmittingTop] = useState(false);

  const fetchTopLevel = useCallback(
    async (p: number, replace: boolean) => {
      setLoadingList(true);
      try {
        const res = await fetch(
          `/api/banks/${bankId}/comments?sort=${sort}&page=${p}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "加载评论失败");
          return;
        }
        const list = (data.comments ?? []) as CommentItem[];
        setTotalPages(data.totalPages ?? 1);
        setPage(p);
        setComments((prev) => (replace ? list : [...prev, ...list]));
      } catch {
        toast.error("加载评论失败");
      } finally {
        setLoadingList(false);
      }
    },
    [bankId, sort]
  );

  useEffect(() => {
    setComments([]);
    fetchTopLevel(1, true);
  }, [bankId, sort, fetchTopLevel]);

  const handlePostTop = async () => {
    const text = topContent.trim();
    if (!text) {
      toast.error("请输入评论内容");
      return;
    }
    setSubmittingTop(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "发送失败");
        return;
      }
      toast.success("已发布");
      setTopContent("");
      await fetchTopLevel(1, true);
    } catch {
      toast.error("发送失败");
    } finally {
      setSubmittingTop(false);
    }
  };

  return (
    <div className="space-y-6 font-serif">
      {loggedIn ? (
        <div className="space-y-2 border-b border-border/60 pb-6">
          <Label htmlFor={`comment-top-${bankId}`} className="text-muted-foreground">
            发表评论
          </Label>
          <Textarea
            id={`comment-top-${bankId}`}
            value={topContent}
            onChange={(e) => setTopContent(e.target.value)}
            placeholder="写下你的想法…"
            rows={3}
            className="resize-y bg-background/80 text-base leading-relaxed"
          />
          <Button size="sm" onClick={handlePostTop} disabled={submittingTop}>
            {submittingTop ? "发送中…" : "发布"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground border-b border-border/60 pb-6">
          登录后即可发表评论
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">排序</span>
        <div className="flex gap-1 rounded-md border border-border/80 bg-muted/20 p-0.5">
          <button
            type="button"
            onClick={() => setSort("latest")}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors",
              sort === "latest"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            最新
          </button>
          <button
            type="button"
            onClick={() => setSort("likes")}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors",
              sort === "likes"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            最热
          </button>
        </div>
      </div>

      <div className="space-y-0">
        {loadingList && comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无评论，来抢沙发吧</p>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              bankId={bankId}
              comment={c}
              depth={0}
              rootCommentId={c.id}
              sort={sort}
              currentUserId={currentUserId}
              canModerate={canModerate}
              loggedIn={loggedIn}
              onTopLevelRefresh={() => fetchTopLevel(1, true)}
            />
          ))
        )}
      </div>

      {page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingList}
            onClick={() => fetchTopLevel(page + 1, false)}
          >
            {loadingList ? "加载中…" : "加载更多"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  bankId,
  comment,
  depth,
  rootCommentId,
  replyToName,
  sort,
  currentUserId,
  canModerate,
  loggedIn,
  onTopLevelRefresh,
  onRemovedFromParent,
}: {
  bankId: string;
  comment: CommentItem;
  depth: number;
  rootCommentId: string;
  replyToName?: string;
  sort: SortMode;
  currentUserId?: string;
  canModerate: boolean;
  loggedIn: boolean;
  onTopLevelRefresh: () => void;
  onRemovedFromParent?: (commentId: string) => void;
}) {
  const isTopLevel = depth === 0;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [replies, setReplies] = useState<CommentItem[]>([]);
  const [replyPage, setReplyPage] = useState(1);
  const [replyTotalPages, setReplyTotalPages] = useState(1);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [localLiked, setLocalLiked] = useState(!!comment.isLiked);
  const [localLikeCount, setLocalLikeCount] = useState(comment.likeCount);

  const canDelete =
    !!currentUserId &&
    (currentUserId === comment.user.id || canModerate);

  const loadReplies = async (p: number, append: boolean) => {
    setLoadingReplies(true);
    try {
      const res = await fetch(
        `/api/banks/${bankId}/comments?parentId=${rootCommentId}&sort=${sort}&page=${p}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "加载回复失败");
        return;
      }
      const list = (data.comments ?? []) as CommentItem[];
      setReplyTotalPages(data.totalPages ?? 1);
      setReplyPage(p);
      setReplies((prev) => (append ? [...prev, ...list] : list));
    } catch {
      toast.error("加载回复失败");
    } finally {
      setLoadingReplies(false);
    }
  };

  const openReply = () => {
    setReplyOpen(true);
    if (isTopLevel && !repliesExpanded) {
      setRepliesExpanded(true);
      void loadReplies(1, false);
    }
  };

  const toggleReplies = () => {
    if (repliesExpanded) {
      setRepliesExpanded(false);
      return;
    }
    setRepliesExpanded(true);
    void loadReplies(1, false);
  };

  const handleLike = async () => {
    if (!loggedIn) {
      toast.error("请先登录");
      return;
    }
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "操作失败");
        return;
      }
      setLocalLiked(data.liked);
      setLocalLikeCount(data.likeCount ?? localLikeCount);
    } catch {
      toast.error("操作失败");
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除这条评论？")) return;
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      if (isTopLevel) onTopLevelRefresh();
      else onRemovedFromParent?.(comment.id);
    } catch {
      toast.error("删除失败");
    }
  };

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text) {
      toast.error("请输入回复内容");
      return;
    }
    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parentId: rootCommentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "回复失败");
        return;
      }
      toast.success("已回复");
      setReplyText("");
      setReplyOpen(false);
      if (isTopLevel) {
        setRepliesExpanded(true);
        await loadReplies(1, false);
      }
      onTopLevelRefresh();
    } catch {
      toast.error("回复失败");
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div
      className={cn(
        "border-b border-border/40 py-4 last:border-b-0",
        !isTopLevel && "ml-4 border-l-2 border-l-primary/15 pl-4 sm:ml-6 sm:pl-5"
      )}
    >
      <div className="flex gap-3">
        <Avatar className="size-9 shrink-0 border border-border/60">
          <AvatarImage src={comment.user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-muted text-xs font-medium">
            {userInitial(comment.user.name, comment.user.uid)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span className="font-medium text-foreground">{displayName(comment.user)}</span>
            {replyToName && (
              <span className="text-xs text-muted-foreground">
                回复 <span className="font-medium text-foreground/70">@{replyToName}</span>
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatTimeAgo(comment.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {comment.content}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleLike}
              className={cn(
                "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                localLiked && "text-primary"
              )}
            >
              <Heart className={cn("size-3.5", localLiked && "fill-primary text-primary")} />
              {localLikeCount}
            </button>
            {loggedIn && (
              <button
                type="button"
                onClick={replyOpen ? () => setReplyOpen(false) : openReply}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <MessageCircle className="size-3.5" />
                回复
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                删除
              </button>
            )}
          </div>

          {isTopLevel && comment._count.replies > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={toggleReplies}
                className="text-xs text-primary/80 hover:underline"
              >
                {repliesExpanded
                  ? "收起回复"
                  : `查看 ${comment._count.replies} 条回复`}
              </button>
            </div>
          )}

          {replyOpen && loggedIn && (
            <div className="space-y-2 pt-3">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`回复 ${displayName(comment.user)}…`}
                rows={2}
                className="resize-y bg-background/80 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={submitReply} disabled={submittingReply}>
                  {submittingReply ? "发送中…" : "发表回复"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyText("");
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {isTopLevel && repliesExpanded && (
            <div className="pt-2">
              {loadingReplies && replies.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">加载回复…</p>
              ) : (
                <>
                  {replies.map((r) => (
                    <CommentRow
                      key={r.id}
                      bankId={bankId}
                      comment={r}
                      depth={1}
                      rootCommentId={rootCommentId}
                      sort={sort}
                      currentUserId={currentUserId}
                      canModerate={canModerate}
                      loggedIn={loggedIn}
                      onTopLevelRefresh={() => {
                        onTopLevelRefresh();
                        loadReplies(1, false);
                      }}
                      onRemovedFromParent={(id) =>
                        setReplies((prev) => prev.filter((x) => x.id !== id))
                      }
                    />
                  ))}
                  {replyPage < replyTotalPages && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-8 text-xs"
                      disabled={loadingReplies}
                      onClick={() => loadReplies(replyPage + 1, true)}
                    >
                      {loadingReplies ? "加载中…" : "加载更多回复"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
