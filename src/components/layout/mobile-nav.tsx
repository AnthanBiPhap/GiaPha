"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GitFork, Home, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { getLastFamilyId } from "@/lib/last-family";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [lastFamilyId, setLastFamilyIdState] = useState<string | null>(null);

  useEffect(() => {
    setLastFamilyIdState(getLastFamilyId());
  }, [pathname]);

  async function openTree(e: React.MouseEvent) {
    e.preventDefault();

    // Đang ở trang một dòng họ → về tab cây
    const onFamily = pathname.match(/^\/families\/([^/]+)/);
    if (onFamily?.[1]) {
      window.dispatchEvent(new CustomEvent("giapha:set-tab", { detail: "tree" }));
      router.replace(`/families/${onFamily[1]}?tab=tree`, { scroll: false });
      return;
    }

    const remembered = getLastFamilyId() ?? lastFamilyId;
    if (remembered) {
      router.push(`/families/${remembered}?tab=tree`);
      return;
    }

    // Chưa từng mở dòng họ → lấy dòng họ đầu tiên nếu có
    const supabase = createClient();
    const { data } = await supabase
      .from("families")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    const first = data?.[0]?.id;
    if (first) {
      router.push(`/families/${first}?tab=tree`);
      return;
    }

    toast.message("Chưa có dòng họ", {
      description: "Vào Dòng họ để tạo hoặc chọn một dòng họ trước.",
    });
    router.push("/dashboard");
  }

  const items = [
    {
      key: "home",
      href: "/",
      label: "Trang chủ",
      icon: Home,
      active: pathname === "/",
      onClick: undefined as ((e: React.MouseEvent) => void) | undefined,
    },
    {
      key: "families",
      href: "/dashboard",
      label: "Dòng họ",
      icon: Users,
      active: pathname.startsWith("/dashboard"),
      onClick: undefined,
    },
    {
      key: "tree",
      href: lastFamilyId ? `/families/${lastFamilyId}?tab=tree` : "/dashboard",
      label: "Cây",
      icon: GitFork,
      active: pathname.startsWith("/families"),
      onClick: openTree,
    },
    {
      key: "account",
      href: "/account",
      label: "Tài khoản",
      icon: UserRound,
      active: pathname.startsWith("/account") || pathname.startsWith("/login") || pathname.startsWith("/register"),
      onClick: undefined,
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
              key={item.key}
              href={item.href}
              onClick={item.onClick}
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
