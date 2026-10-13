"use client";

import { startLogin, useSession } from "@/lib/client-auth";
import { Button } from "./ui/button";
import { RequestState } from "./ui/request-state";

export function AuthenticationState() {
  const { status, retry } = useSession();
  if (status === "error") return <RequestState title="暂时无法获取登录信息" description="请稍后重试，当前页面不会自动刷新。" onRetry={retry} />;
  if (status === "unauthenticated") return <div className="request-state"><p className="flex-1 text-sm">登录后查看你的内容和订阅。</p><Button onClick={startLogin}>登录</Button></div>;
  return <RequestState title="正在获取登录信息" loading />;
}
