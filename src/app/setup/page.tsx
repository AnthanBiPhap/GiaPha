"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetupPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function check() {
    const res = await fetch("/api/setup");
    const data = (await res.json()) as { ready: boolean };
    setReady(data.ready);
  }

  useEffect(() => {
    void check();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databasePassword: password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Setup thất bại");
        return;
      }
      toast.success(data.message ?? "Thành công");
      setReady(true);
      setPassword("");
    } catch {
      toast.error("Không gọi được API setup");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Thiết lập database</CardTitle>
          <CardDescription>
            Tạo bảng dòng họ / thành viên trên Supabase để dùng thêm-sửa-xóa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ready === true && (
            <div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
              Database đã sẵn sàng.{" "}
              <Link href="/dashboard" className="text-primary underline-offset-2 hover:underline">
                Vào Dashboard
              </Link>
            </div>
          )}

          {ready === false && (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Lấy mật khẩu tại Supabase →{" "}
                <strong>Project Settings → Database → Database password</strong>
                (mật khẩu lúc tạo project).
              </p>
              <div className="space-y-2">
                <Label htmlFor="db-pass">Database password</Label>
                <Input
                  id="db-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Đang tạo bảng..." : "Tạo bảng ngay"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Hoặc tự chạy file <code>supabase/schema.sql</code> trong SQL Editor.
              </p>
            </form>
          )}

          {ready === null && (
            <p className="text-sm text-muted-foreground">Đang kiểm tra...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
