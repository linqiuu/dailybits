"use client";

import { useState, useEffect } from "react";
import { signIn, getProviders, type ClientSafeProvider } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function IntranetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10v4M10 10v4M14 10v4M18 10v4M2 12h20" />
    </svg>
  );
}

const PROVIDER_META: Record<string, { icon: React.ReactNode; label: string }> = {
  github: { icon: <GithubIcon />, label: "使用 GitHub 登录" },
  "company-sso": { icon: <IntranetIcon />, label: "内网账号登录" },
};

export default function LoginPage() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  const providerList = providers ? Object.values(providers) : [];

  return (
    <div className="page-enter flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm border-border/60 bg-card/80 shadow-lg shadow-primary/5">
        <CardHeader className="space-y-2 text-center">
          <h1 className="font-serif text-2xl font-semibold tracking-wide">
            欢迎回到书房
          </h1>
          <p className="text-sm text-muted-foreground">
            登录以开始你的知识之旅
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divider-literary text-xs">选择登录方式</div>
          {providerList.length === 0 ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            providerList.map((provider) => {
              const meta = PROVIDER_META[provider.id];
              return (
                <Button
                  key={provider.id}
                  variant="outline"
                  className="w-full gap-2 border-border hover:bg-secondary"
                  onClick={() => signIn(provider.id, { callbackUrl: "/" })}
                >
                  {meta?.icon}
                  {meta?.label ?? `使用 ${provider.name} 登录`}
                </Button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
