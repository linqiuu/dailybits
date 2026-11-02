"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_GROUP_ID_LENGTH, normalizeGroupId } from "@/lib/groups/identity";

interface Props {
  groupId?: string;
  active?: boolean;
  className?: string;
  onEntered?: () => void;
}

export function GroupEntryDialog({ groupId, active, className, onEntered }: Props) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(groupId ?? "");
  const [error, setError] = useState("");
  const Icon = groupId ? ArrowLeftRight : Users;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) { setValue(groupId ?? ""); setError(""); }
      setOpen(nextOpen);
    }}>
      <DialogTrigger render={<Button variant={groupId ? "outline" : "ghost"} size="sm" className={className} data-active={active} />}>
        <Icon className="size-4" aria-hidden />
        {groupId ? "切换群" : "群订阅"}
      </DialogTrigger>
      <DialogContent className="rounded-lg">
        <form className="space-y-5" noValidate onSubmit={(event) => {
          event.preventDefault();
          const target = normalizeGroupId(String(new FormData(event.currentTarget).get("groupId") ?? ""));
          if (!target) { setError("请输入有效的纯数字群号"); return; }
          router.push(`/group/${target}`);
          setOpen(false);
          onEntered?.();
        }}>
          <DialogHeader>
            <DialogTitle>{groupId ? "切换订阅群" : "群订阅"}</DialogTitle>
            <DialogDescription>为群聊订阅题库、知识卡片和每日资讯。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={fieldId}>群号</Label>
            <Input id={fieldId} name="groupId" inputMode="numeric" autoComplete="off" autoFocus
              maxLength={MAX_GROUP_ID_LENGTH} placeholder="输入群号" value={value}
              aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldId}-error` : undefined}
              onChange={(event) => { setValue(event.target.value); setError(""); }} />
            {error ? <p id={`${fieldId}-error`} className="text-xs text-destructive" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">进入群订阅</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
