"use client";

import { useEffect, useState } from "react";
import { MapPin, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { emptyMemberForm, formToPayload, memberToForm } from "@/lib/members";
import type { Member, MemberFormValues, MemberPhoto } from "@/types/database";

type Props = {
  familyId: string;
  member?: Member | null;
  members?: Member[];
  onSaved: () => void;
  onCancel: () => void;
};

type LocalFile = {
  id: string;
  file: File;
  preview: string;
};

export function MemberForm({ familyId, member, members = [], onSaved, onCancel }: Props) {
  const [form, setForm] = useState<MemberFormValues>(
    member ? memberToForm(member) : emptyMemberForm(),
  );
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<MemberPhoto[]>([]);
  const [pendingFiles, setPendingFiles] = useState<LocalFile[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(Boolean(member));

  function setField<K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!member) return;
    void (async () => {
      setLoadingPhotos(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("member_photos")
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: true });
      if (error) toast.error(error.message);
      else setExistingPhotos((data as MemberPhoto[]) ?? []);
      setLoadingPhotos(false);
    })();
  }, [member]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: LocalFile[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} không phải ảnh`);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} vượt quá 8MB`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      });
    }
    setPendingFiles((prev) => [...prev, ...next]);
  }

  function removePending(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function deleteExistingPhoto(photo: MemberPhoto) {
    if (!confirm("Xóa ảnh này?")) return;
    const supabase = createClient();
    if (photo.storage_path) {
      await supabase.storage.from("graves").remove([photo.storage_path]);
    }
    const { error } = await supabase.from("member_photos").delete().eq("id", photo.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    toast.success("Đã xóa ảnh");
  }

  async function uploadPhotos(memberId: string) {
    if (pendingFiles.length === 0) return;
    const supabase = createClient();
    for (const item of pendingFiles) {
      const ext = item.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `${familyId}/${memberId}/${crypto.randomUUID()}.${ext}`;
      const { error: upError } = await supabase.storage
        .from("graves")
        .upload(storagePath, item.file, {
          upsert: false,
          contentType: item.file.type || "image/jpeg",
        });
      if (upError) throw upError;
      const { data } = supabase.storage.from("graves").getPublicUrl(storagePath);
      const { error: dbError } = await supabase.from("member_photos").insert({
        family_id: familyId,
        member_id: memberId,
        url: data.publicUrl,
        storage_path: storagePath,
      });
      if (dbError) throw dbError;
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị");
      return;
    }

    setLocating(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setLocating(false);
    };

    // Phòng trường hợp trình duyệt không gọi callback
    const safety = window.setTimeout(() => {
      finish();
      toast.error("Hết thời gian lấy GPS — thử lại");
    }, 12000);

    const applyPosition = (pos: GeolocationPosition) => {
      window.clearTimeout(safety);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setField("current_place", `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      setField("current_lat", String(lat));
      setField("current_lng", String(lng));
      finish();
      toast.success("Đã lấy vị trí đang đứng — bấm Lưu để gắn vào bản đồ");

      // Địa chỉ chi tiết lấy sau, không chặn nút GPS
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), 5000);
      void fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" }, signal: controller.signal },
      )
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { display_name?: string };
          if (data.display_name) setField("current_place", data.display_name);
        })
        .catch(() => {
          /* ignore */
        });
    };

    const onError = (err: GeolocationPositionError) => {
      // Thử lại độ chính xác thấp nếu lần 1 thất bại / timeout
      navigator.geolocation.getCurrentPosition(
        applyPosition,
        (err2) => {
          window.clearTimeout(safety);
          finish();
          if (err2.code === err2.PERMISSION_DENIED || err.code === err.PERMISSION_DENIED) {
            toast.error("Bạn cần cho phép truy cập vị trí trên trình duyệt");
          } else {
            toast.error("Không lấy được vị trí GPS");
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };

    navigator.geolocation.getCurrentPosition(applyPosition, onError, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 10000,
    });
  }

  const hasGps =
    Boolean(form.current_lat.trim()) && Boolean(form.current_lng.trim());
  const previewLat = Number(form.current_lat);
  const previewLng = Number(form.current_lng);
  const previewOk = Number.isFinite(previewLat) && Number.isFinite(previewLng);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = formToPayload(form, familyId);
      const supabase = createClient();
      let memberId = member?.id;
      let generation: number | null = null;

      if (!member && parentId) {
        const parent = members.find((m) => m.id === parentId);
        generation = (parent?.generation ?? 1) + 1;
      }

      if (member) {
        const { error } = await supabase
          .from("members")
          .update(payload)
          .eq("id", member.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("members")
          .insert({
            ...payload,
            generation,
            is_alive: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        memberId = data.id as string;

        if (parentId && memberId) {
          const { error: relError } = await supabase.from("relationships").insert({
            family_id: familyId,
            person_a: parentId,
            person_b: memberId,
            relation_type: "parent_child",
          });
          if (relError) throw relError;
        }
      }

      if (!memberId) throw new Error("Không có id thành viên");
      await uploadPhotos(memberId);

      toast.success(member ? "Đã cập nhật thành viên" : "Đã thêm thành viên");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain">
      <div className="space-y-2">
        <Label htmlFor="full_name">Họ và tên</Label>
        <Input
          id="full_name"
          required
          value={form.full_name}
          onChange={(e) => setField("full_name", e.target.value)}
          placeholder="Ví dụ: Lê Văn Đại Lang"
          autoFocus
        />
      </div>

      {!member && members.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="parent">Cha/mẹ trên cây (để nối đời dưới)</Label>
          <Select
            id="parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— Không nối (đời 1) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
                {m.generation ? ` (đời ${m.generation})` : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-2 rounded-md border border-border/80 bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Vị trí trên bản đồ</Label>
            <p className="text-xs text-muted-foreground">
              Bấm GPS lấy chỗ đang đứng → kiểm tra → Lưu
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={locateMe} disabled={locating}>
            <MapPin className="h-3.5 w-3.5" />
            {locating ? "Đang lấy..." : "Định vị GPS"}
          </Button>
        </div>
        <Input
          value={form.current_place}
          onChange={(e) => setField("current_place", e.target.value)}
          placeholder="Địa chỉ / mô tả vị trí"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.current_lat}
            onChange={(e) => setField("current_lat", e.target.value)}
            placeholder="Vĩ độ (lat)"
            inputMode="decimal"
          />
          <Input
            value={form.current_lng}
            onChange={(e) => setField("current_lng", e.target.value)}
            placeholder="Kinh độ (lng)"
            inputMode="decimal"
          />
        </div>

        {hasGps && previewOk && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Xem trước vị trí (chưa lưu cho đến khi bấm Cập nhật / Thêm thành viên)
            </p>
            <div className="overflow-hidden rounded-md border border-border">
              <iframe
                title="Xem trước vị trí GPS"
                className="h-56 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${previewLng - 0.01}%2C${previewLat - 0.01}%2C${previewLng + 0.01}%2C${previewLat + 0.01}&layer=mapnik&marker=${previewLat}%2C${previewLng}`}
              />
            </div>
            <a
              href={`https://www.openstreetmap.org/?mlat=${previewLat}&mlon=${previewLng}#map=16/${previewLat}/${previewLng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-primary underline-offset-2 hover:underline"
            >
              Mở bản đồ lớn
            </a>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Ghi chú (tuỳ chọn)</Label>
        <Textarea
          id="note"
          value={form.note}
          onChange={(e) => setField("note", e.target.value)}
          placeholder="Ghi chú thêm về bia mộ / thành viên"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label>Ảnh bia mộ</Label>
            <p className="text-xs text-muted-foreground">Có thể chọn nhiều ảnh cùng lúc</p>
          </div>
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Thêm ảnh
            </span>
          </label>
        </div>

        {loadingPhotos && (
          <p className="text-xs text-muted-foreground">Đang tải ảnh...</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {existingPhotos.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Ảnh bia mộ" className="h-28 w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                onClick={() => void deleteExistingPhoto(photo)}
                aria-label="Xóa ảnh"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {pendingFiles.map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-md border border-dashed border-primary/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview} alt={item.file.name} className="h-28 w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white"
                onClick={() => removePending(item.id)}
                aria-label="Bỏ ảnh"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                Mới
              </span>
            </div>
          ))}
        </div>

        {!loadingPhotos && existingPhotos.length === 0 && pendingFiles.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Chưa có ảnh bia mộ. Bấm &quot;Thêm ảnh&quot; để tải lên.
          </p>
        )}
      </div>
      </div>

      <div className="shrink-0 -mx-4 mt-auto flex justify-end gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu..." : member ? "Cập nhật" : "Thêm thành viên"}
        </Button>
      </div>
    </form>
  );
}
