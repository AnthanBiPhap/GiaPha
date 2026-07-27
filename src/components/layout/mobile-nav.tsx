"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitFork, Home, LogIn, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  const items = [
    {
      href: "/",
      label: "Trang chủ",
      icon: Home,
      active: pathname === "/",
    },
    {
      href: "/dashboard",
      label: "Dòng họ",
      icon: Users,
      active: pathname.startsWith("/dashboard") && !pathname.startsWith("/families"),
    },
    {
      href: "/dashboard",
      label: "Cây",
      icon: GitFork,
      active: pathname.startsWith("/families"),
    },
    {
      href: "/login",
      label: "Tài khoản",
      icon: LogIn,
      active: pathname.startsWith("/login") || pathname.startsWith("/register"),
    },
  ];

  return (
    <nav
      className="mobile-bottom-nav border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Điều hướng điện thoại"
    >
      <div className="mx-auto grid h-[3.75rem] max-w-lg grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                item.active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={item.active ? 2.25 : 1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
