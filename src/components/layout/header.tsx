"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Compass,
  Github,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOut, startLogin, useSession } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "发现", icon: Compass },
  { href: "/dashboard", label: "我的学习", icon: LayoutDashboard },
];

function userInitial(name?: string | null, uid?: string | null): string {
  return (name?.trim() || uid?.trim() || "D").slice(0, 1).toUpperCase();
}

export function Header() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const user = session?.user;
  const visibleNavLinks = user?.isAdmin
    ? [...navLinks, { href: "/admin", label: "总览", icon: BarChart3 }]
    : navLinks;

  return (
    <header className="nav-chrome sticky top-0 z-50">
      <div className="nav-shell mx-auto flex w-full max-w-[1440px] min-w-0 items-center justify-between px-5 sm:px-7 lg:px-10">
        <Link href="/" className="brand-card flex min-w-0 items-center gap-3">
          <span className="brand-tile flex size-9 shrink-0 items-end justify-center gap-[3px] rounded-md pb-2" aria-hidden="true">
            <span className="h-2.5 w-[3px] bg-current" />
            <span className="h-4 w-[3px] bg-current" />
            <span className="h-3 w-[3px] bg-current" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold leading-5 text-white">
              DailyBits
            </span>
            <span className="block text-[10px] font-medium uppercase leading-4 text-white/55">
              Learning catalogue
            </span>
          </span>
        </Link>

        <nav className="nav-pill hidden items-center gap-1 sm:flex">
          {visibleNavLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                data-active={active}
                className={cn(
                  "route-tab inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                  active
                    ? ""
                    : "hover:border-border hover:bg-card/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {link.label}
              </Link>
            );
          })}
          <Link
            href="https://github.com/linqiuu/dailybits"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="GitHub"
            title="GitHub"
          >
            <Github className="size-4" aria-hidden />
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar className="ml-2 size-9 cursor-pointer border border-white/15">
                  <AvatarImage src={user.image || ""} alt={user.name || ""} />
                  <AvatarFallback className="bg-white/10 text-xs font-medium text-white">
                    {userInitial(user.name, user.uid)}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium">
                    {user.name || user.uid || user.id}
                  </div>
                  {user.department ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {user.department}
                    </div>
                  ) : null}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Link href="/dashboard" className="flex w-full items-center gap-2">
                    <LayoutDashboard className="size-4" aria-hidden />
                    我的订阅
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="size-4" aria-hidden />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="ml-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              onClick={startLogin}
            >
              <ShieldCheck className="size-3.5" aria-hidden />
              登录
            </Button>
          )}
        </nav>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="default"
                size="icon-lg"
                className="ml-auto bg-[color:var(--surface-ink)] text-primary-foreground sm:hidden"
              />
            }
          >
            <Menu className="size-5 text-primary-foreground" aria-hidden />
            <span className="sr-only">打开导航</span>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="text-base font-semibold">DailyBits</SheetTitle>
            <nav className="mt-6 flex flex-col gap-2">
              {visibleNavLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium",
                      pathname === link.href
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {link.label}
                  </Link>
                );
              })}
              <div className="my-3 border-t border-border" />
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar className="size-9 border border-border">
                      <AvatarImage src={user.image || ""} alt={user.name || ""} />
                      <AvatarFallback className="bg-secondary text-xs text-primary">
                        {userInitial(user.name, user.uid)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {user.name || user.uid || user.id}
                      </div>
                      {user.department ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {user.department}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" aria-hidden />
                    退出登录
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    startLogin();
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-primary hover:bg-primary/10"
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  登录
                </button>
              )}
              <Link
                href="https://github.com/linqiuu/dailybits"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Github className="size-4" aria-hidden />
                GitHub
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
