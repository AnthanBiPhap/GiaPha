"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Family } from "@/types/database";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Family | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  async function loadFamilies() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("families")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      const missing =
        error.message.includes("schema cache") ||
        error.message.includes("Could not find") ||
        error.code === "PGRST205";
      setNeedsSetup(missing);
      if (!missing) toast.error(error.message);
      setFamilies([]);
    } else {
      setNeedsSetup(false);
      setFamilies((data as Family[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadFamilies();
  }, []);

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nhập tên dòng họ");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (!current) {
      toast.error("Bạn cần đăng nhập");
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("families")
      .insert({ name: name.trim(), owner_id: current.id })
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      const missing =
        error.message.includes("schema cache") ||
        error.message.includes("Could not find") ||
        error.code === "PGRST205";
      toast.error(
        missing
          ? "Chưa có bảng dữ liệu — hãy vào trang Thiết lập"
          : error.message,
      );
      if (missing) setNeedsSetup(true);
      return;
    }
    toast.success("Đã tạo dòng họ");
    setOpen(false);
    setName("");
    router.push(`/families/${data.id}`);
  }

  function openDeleteDialog(family: Family, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(family);
    setDeleteConfirmText("");
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleting(false);
  }

  async function confirmDeleteFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget) return;
    if (deleteConfirmText !== deleteTarget.name) {
      toast.error("Chưa gõ đúng tên dòng họ");
      return;
    }
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("families").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa dòng họ");
    closeDeleteDialog();
    void loadFamilies();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const filtered = families.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
      {needsSetup && isLoggedIn && (
        <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
          <p className="font-medium">Chưa thiết lập database</p>
          <p className="mt-1 text-muted-foreground">
            Cần tạo bảng trên Supabase trước khi thêm dòng họ / thành viên.
          </p>
          <Link href="/setup" className="mt-3 inline-block">
            <Button size="sm">Thiết lập ngay</Button>
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            {isLoggedIn ? "Dòng họ của bạn" : "Dòng họ"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoggedIn
              ? "Tạo dòng họ, rồi thêm / sửa / xóa thành viên."
              : "Xem gia phả. Đăng nhập nếu bạn cần quản lý."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {isLoggedIn ? (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => setOpen(true)} disabled={needsSetup}>
                <Plus className="h-4 w-4" />
                Tạo dòng họ
              </Button>
            </>
          ) : (
            <Link href="/login" className="col-span-2 w-full sm:col-span-1 sm:w-auto">
              <Button className="w-full sm:w-auto">Đăng nhập để quản lý</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="relative mt-8 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Tìm theo tên dòng họ..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        )}
        {!loading && !needsSetup && filtered.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {isLoggedIn
                ? "Chưa có dòng họ nào. Bấm \"Tạo dòng họ\" để bắt đầu."
                : "Chưa có dòng họ để xem."}
            </CardContent>
          </Card>
        )}
        {filtered.map((family) => {
          const owned = Boolean(user && family.owner_id === user.id);
          return (
            <Link key={family.id} href={`/families/${family.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{family.name}</CardTitle>
                      <CardDescription>
                        Tạo ngày {formatDate(family.created_at)}
                        {!isLoggedIn && " · Chỉ xem"}
                      </CardDescription>
                    </div>
                    {owned && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => openDeleteDialog(family, e)}
                      >
                        Xóa
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {isLoggedIn && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="Tạo dòng họ">
            <DialogHeader>
              <DialogTitle>Tạo dòng họ</DialogTitle>
              <DialogDescription>
                Ví dụ: &quot;Dòng họ Lê — Chi trưởng&quot;
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => void createFamily(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="family-name">Tên dòng họ</Label>
                <Input
                  id="family-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dòng họ..."
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Đang lưu..." : "Tạo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) closeDeleteDialog();
        }}
      >
        <DialogContent title="Xóa dòng họ">
          <DialogHeader>
            <DialogTitle>Xóa dòng họ</DialogTitle>
            <DialogDescription>
              Thao tác này xóa vĩnh viễn dòng họ, thành viên và dữ liệu liên quan. Không hoàn tác
              được.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <form onSubmit={(e) => void confirmDeleteFamily(e)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Để xác nhận, hãy gõ{" "}
                <span className="font-semibold text-foreground">{deleteTarget.name}</span> vào ô
                bên dưới:
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Tên dòng họ</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.name}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDeleteDialog}>
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deleting || deleteConfirmText !== deleteTarget.name}
                >
                  {deleting ? "Đang xóa..." : "Tôi hiểu, xóa dòng họ này"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
