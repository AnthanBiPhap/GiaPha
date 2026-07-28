"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const { user, isLoggedIn, loading } = useAuth();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất");
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-sm text-muted-foreground">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-2xl">
            <UserRound className="h-6 w-6 text-primary" />
            Tài khoản
          </CardTitle>
          <CardDescription>
            {isLoggedIn
              ? "Quản lý phiên đăng nhập Gia Phả Cao Tổ."
              : "Đăng nhập để quản lý dòng họ và cây gia phả."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoggedIn && user ? (
            <>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="mt-0.5 font-medium break-all">{user.email ?? "—"}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </Button>
              <Link href="/dashboard" className="block">
                <Button className="w-full" variant="secondary">
                  Về danh sách dòng họ
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="block">
                <Button className="w-full">
                  <LogIn className="h-4 w-4" />
                  Đăng nhập
                </Button>
              </Link>
              <Link href="/register" className="block">
                <Button className="w-full" variant="outline">
                  Đăng ký
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
