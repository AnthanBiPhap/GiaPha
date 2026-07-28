"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, LogIn, LogOut, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  downloadAllOwnedBackups,
  parseBackupFile,
  restoreBackupAsNewFamilies,
} from "@/lib/backup";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const { user, isLoggedIn, loading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất");
    router.push("/");
    router.refresh();
  }

  async function backupAll() {
    if (!user) return;
    setBackingUp(true);
    try {
      const n = await downloadAllOwnedBackups(user.id);
      toast.success(`Đã tải backup ${n} dòng họ — giữ file JSON cẩn thận`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không sao lưu được");
    } finally {
      setBackingUp(false);
    }
  }

  async function onRestoreFile(file: File | null) {
    if (!file || !user) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const backup = parseBackupFile(text);
      const ok = window.confirm(
        `Khôi phục ${backup.families.length} dòng họ từ backup?\n\nSẽ tạo dòng họ mới (thêm chữ "khôi phục"), không ghi đè dữ liệu hiện có.`,
      );
      if (!ok) return;
      const n = await restoreBackupAsNewFamilies(backup, user.id);
      toast.success(`Đã khôi phục ${n} dòng họ`);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không khôi phục được");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-sm text-muted-foreground">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8 sm:py-12">
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

      {isLoggedIn && user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sao lưu dữ liệu</CardTitle>
            <CardDescription>
              Tải file JSON về máy / Google Drive. Khi có sự cố, dùng file đó để khôi phục.
              Nên sao lưu định kỳ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              variant="outline"
              disabled={backingUp}
              onClick={() => void backupAll()}
            >
              <Download className="h-4 w-4" />
              {backingUp ? "Đang tạo backup..." : "Tải backup tất cả dòng họ"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void onRestoreFile(e.target.files?.[0] ?? null)}
            />
            <Button
              className="w-full"
              variant="secondary"
              disabled={restoring}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {restoring ? "Đang khôi phục..." : "Khôi phục từ file backup"}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Khôi phục tạo dòng họ mới, không xóa dữ liệu cũ. Ảnh vẫn trỏ link Storage hiện có —
              nếu xóa luôn file ảnh trên Supabase thì chỉ còn metadata trong backup.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
