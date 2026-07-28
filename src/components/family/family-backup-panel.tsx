"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadFamilyBackup,
  parseBackupFile,
  restoreBackupAsNewFamilies,
} from "@/lib/backup";
import { createClient } from "@/lib/supabase/client";

type Props = {
  familyId: string;
  familyName: string;
  canEdit: boolean;
  onRestored?: () => void;
};

export function FamilyBackupPanel({
  familyId,
  familyName,
  canEdit,
  onRestored,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function download() {
    setBackingUp(true);
    try {
      await downloadFamilyBackup(familyId, familyName);
      toast.success("Đã tải file backup về máy");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được backup");
    } finally {
      setBackingUp(false);
    }
  }

  async function onRestoreFile(file: File | null) {
    if (!file) return;
    if (!canEdit) {
      toast.error("Cần đăng nhập chủ dòng họ để khôi phục");
      return;
    }
    setRestoring(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Bạn cần đăng nhập");
        return;
      }
      const text = await file.text();
      const backup = parseBackupFile(text);
      const ok = window.confirm(
        `Khôi phục ${backup.families.length} dòng họ từ file?\n\nSẽ tạo dòng họ mới (thêm chữ "khôi phục"), không ghi đè dòng họ này.`,
      );
      if (!ok) return;
      const n = await restoreBackupAsNewFamilies(backup, user.id);
      toast.success(`Đã khôi phục ${n} dòng họ — xem ở mục Dòng họ`);
      onRestored?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không khôi phục được");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Sao lưu dòng họ</CardTitle>
          <CardDescription>
            Tải dữ liệu &quot;{familyName}&quot; về máy (JSON). Khi có sự cố, đẩy file lên để khôi
            phục.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            disabled={backingUp}
            onClick={() => void download()}
          >
            <Download className="h-4 w-4" />
            {backingUp ? "Đang tạo file..." : "Tải backup về máy"}
          </Button>

          {canEdit ? (
            <>
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
                {restoring ? "Đang khôi phục..." : "Đẩy file backup lên (khôi phục)"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Đăng nhập chủ dòng họ để khôi phục từ file.
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            File gồm thành viên, quan hệ, sự kiện, link ảnh. Khôi phục tạo dòng họ mới, không xóa
            dòng họ hiện tại. Nên lưu file trên máy hoặc Google Drive.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
