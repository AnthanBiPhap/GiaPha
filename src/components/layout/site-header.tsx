"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { isLoggedIn } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-3 sm:h-14 sm:px-4">
        <Link
          href="/"
          className="font-serif text-base tracking-tight text-primary sm:text-lg"
        >
          Gia Phả Cao Tổ
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
          <Link href="/dashboard" className="hover:text-foreground">
            Dòng họ
          </Link>
          {isLoggedIn ? (
            <Link href="/dashboard" className="hover:text-foreground">
              Quản lý
            </Link>
          ) : (
            <Link href="/login" className="hover:text-foreground">
              Đăng nhập
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
