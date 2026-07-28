"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FamilyMap } from "@/components/family/family-map";
import { FamilyTimeline } from "@/components/family/family-timeline";
import { FamilyTree } from "@/components/family/family-tree";
import { MemberForm } from "@/components/members/member-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { usePreventPageReloadGestures } from "@/hooks/use-lock-touch-gestures";
import { createClient } from "@/lib/supabase/client";
import type {
  Family,
  FamilyEvent,
  Member,
  MemberPhoto,
  Relationship,
} from "@/types/database";

export default function FamilyDetailPage() {
  const params = useParams<{ id: string }>();
  const familyId = params.id;
  const router = useRouter();

  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [photos, setPhotos] = useState<MemberPhoto[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [tab, setTab] = useState("tree");
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingMember, setDeletingMember] = useState(false);
  const { user } = useAuth();
  const canEdit = Boolean(user && family && user.id === family.owner_id);

  // iOS: block rubber-band pull-to-refresh while on tree/map (worse with fast swipes).
  usePreventPageReloadGestures(tab === "tree" || tab === "map");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // Avoid full-page "Đang tải..." remount on refresh (feels like a page reload).
    if (!opts?.silent) setLoading(true);
    const supabase = createClient();
    const [familyRes, membersRes, photosRes, relRes, eventsRes] = await Promise.all([
      supabase.from("families").select("*").eq("id", familyId).single(),
      supabase.from("members").select("*").eq("family_id", familyId).order("created_at"),
      supabase.from("member_photos").select("*").eq("family_id", familyId).order("created_at"),
      supabase.from("relationships").select("*").eq("family_id", familyId),
      supabase.from("events").select("*").eq("family_id", familyId).order("event_date"),
    ]);

    if (familyRes.error) {
      toast.error(familyRes.error.message);
      setLoading(false);
      return;
    }
    setFamily(familyRes.data as Family);
    if (membersRes.error) toast.error(membersRes.error.message);
    else setMembers((membersRes.data as Member[]) ?? []);
    if (photosRes.error) toast.error(photosRes.error.message);
    else setPhotos((photosRes.data as MemberPhoto[]) ?? []);
    if (relRes.error) toast.error(relRes.error.message);
    else setRelationships((relRes.data as Relationship[]) ?? []);
    if (eventsRes.error) toast.error(eventsRes.error.message);
    else setEvents((eventsRes.data as FamilyEvent[]) ?? []);
    setLoading(false);
  }, [familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  const photosByMember = useMemo(() => {
    const map = new Map<string, MemberPhoto[]>();
    for (const photo of photos) {
      if (!map.has(photo.member_id)) map.set(photo.member_id, []);
      map.get(photo.member_id)!.push(photo);
    }
    return map;
  }, [photos]);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.current_place?.toLowerCase().includes(q),
    );
  }, [members, query]);

  function requestDeleteMember(member: Member) {
    // Cha/mẹ (person_a) còn quan hệ parent_child → bắt buộc xóa con trước
    const childRels = relationships.filter(
      (r) => r.relation_type === "parent_child" && r.person_a === member.id,
    );
    if (childRels.length > 0) {
      const childNames = childRels
        .map((r) => members.find((m) => m.id === r.person_b)?.full_name ?? "thành viên con")
        .join(", ");
      toast.error(
        `Không thể xóa "${member.full_name}". Hãy xóa cây con trước: ${childNames}`,
      );
      return;
    }
    setDeleteTarget(member);
    setDeleteStep(1);
    setDeleteConfirmText("");
  }

  function closeDeleteMemberDialog() {
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteConfirmText("");
    setDeletingMember(false);
  }

  async function confirmDeleteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget) return;
    if (deleteConfirmText !== deleteTarget.full_name) {
      toast.error("Chưa gõ đúng họ tên thành viên");
      return;
    }

    setDeletingMember(true);
    const supabase = createClient();
    await supabase
      .from("relationships")
      .delete()
      .or(`person_a.eq.${deleteTarget.id},person_b.eq.${deleteTarget.id}`);

    const { error } = await supabase.from("members").delete().eq("id", deleteTarget.id);
    setDeletingMember(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa thành viên");
    closeDeleteMemberDialog();
    refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
        Đang tải dòng họ...
      </div>
    );
  }

  if (!family) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Không tìm thấy dòng họ.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/dashboard")}>
          Quay lại
        </Button>
      </div>
    );
  }

  const isTreeTab = tab === "tree";

  return (
    <div
      className={
        isTreeTab
          ? "mx-auto flex h-[calc(100dvh-3.5rem-4.25rem)] max-w-6xl flex-col px-3 pt-2 sm:h-auto sm:px-4 sm:py-10 md:min-h-0"
          : "mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10"
      }
    >
      <div className={isTreeTab ? "hidden sm:flex sm:flex-col sm:gap-4" : "flex flex-col gap-4"}>
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tất cả dòng họ
          </Link>
          <h1 className="font-serif text-2xl sm:text-3xl">{family.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} thành viên · {relationships.length} quan hệ
          </p>
          {!canEdit && (
            <p className="mt-2 text-sm text-muted-foreground">
              Đang xem ·{" "}
              <Link href="/login" className="text-primary underline-offset-2 hover:underline">
                Đăng nhập
              </Link>{" "}
              để quản lý
            </p>
          )}
        </div>
      </div>

      {isTreeTab && (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 sm:hidden">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dòng họ
            </Link>
            <p className="truncate font-serif text-lg leading-tight text-primary">{family.name}</p>
          </div>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={setTab}
        defaultValue="tree"
        className={isTreeTab ? "flex min-h-0 flex-1 flex-col sm:mt-8" : "mt-6 sm:mt-8"}
      >
        <TabsList className="shrink-0">
          <TabsTrigger value="tree">Cây gia phả</TabsTrigger>
          <TabsTrigger value="members">Thành viên</TabsTrigger>
          <TabsTrigger value="map">Bản đồ</TabsTrigger>
          <TabsTrigger value="timeline">Dòng thời gian</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Tìm theo tên, địa chỉ..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="grid gap-3">
            {filteredMembers.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {canEdit
                    ? "Chưa có thành viên. Vào tab Cây gia phả để thêm cao tổ / thêm con."
                    : "Chưa có thành viên."}
                </CardContent>
              </Card>
            )}
            {filteredMembers.map((member) => {
              const memberPhotos = photosByMember.get(member.id) ?? [];
              const childCount = relationships.filter(
                (r) =>
                  r.relation_type === "parent_child" && r.person_a === member.id,
              ).length;
              return (
                <Card key={member.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{member.full_name}</p>
                        {member.current_place && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {member.current_place}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {memberPhotos.length} ảnh bia mộ
                          {childCount > 0 ? ` · ${childCount} con trên cây` : ""}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(member);
                              setMemberOpen(true);
                            }}
                          >
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={
                              childCount > 0
                                ? "Xóa các thành viên con trước"
                                : "Xóa thành viên"
                            }
                            onClick={() => requestDeleteMember(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {memberPhotos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {memberPhotos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={`Ảnh bia mộ ${member.full_name}`}
                              className="h-20 w-20 rounded-md border border-border object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="tree" className="mt-2 flex min-h-0 flex-1 flex-col">
          <FamilyTree
            familyId={familyId}
            members={members}
            relationships={relationships}
            onChanged={refresh}
            canEdit={canEdit}
            onEditMember={(member) => {
              setEditing(member);
              setMemberOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="map">
          <FamilyMap members={members} />
        </TabsContent>

        <TabsContent value="timeline">
          <FamilyTimeline events={events} members={members} />
        </TabsContent>
      </Tabs>

      {canEdit && (
        <>
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent title={editing ? "Sửa thành viên" : "Thêm thành viên"}>
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{editing ? "Sửa thành viên" : "Thêm thành viên"}</DialogTitle>
              <DialogDescription>
                Nhập họ tên và tải nhiều ảnh bia mộ để lưu trữ.
              </DialogDescription>
            </DialogHeader>
            <MemberForm
              familyId={familyId}
              member={editing}
              members={members}
              onCancel={() => setMemberOpen(false)}
              onSaved={() => {
                setMemberOpen(false);
                refresh();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) closeDeleteMemberDialog();
        }}
      >
        <DialogContent title="Xóa thành viên" className="sm:max-w-md sm:h-auto">
          <DialogHeader>
            <DialogTitle>Xóa thành viên</DialogTitle>
            <DialogDescription>
              {deleteStep === 1
                ? "Xác nhận lần 1 — thao tác không hoàn tác."
                : "Xác nhận lần 2 — gõ đúng họ tên để xóa."}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && deleteStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Bạn sắp xóa{" "}
                <span className="font-semibold text-foreground">{deleteTarget.full_name}</span>.
                Toàn bộ quan hệ liên quan cũng sẽ bị gỡ.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDeleteMemberDialog}>
                  Hủy
                </Button>
                <Button type="button" variant="destructive" onClick={() => setDeleteStep(2)}>
                  Tiếp tục xóa
                </Button>
              </div>
            </div>
          )}
          {deleteTarget && deleteStep === 2 && (
            <form onSubmit={(e) => void confirmDeleteMember(e)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gõ{" "}
                <span className="font-semibold text-foreground">{deleteTarget.full_name}</span>{" "}
                vào ô bên dưới để xác nhận:
              </p>
              <div className="space-y-2">
                <Label htmlFor="member-delete-confirm">Họ tên thành viên</Label>
                <Input
                  id="member-delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.full_name}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDeleteMemberDialog}>
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    deletingMember || deleteConfirmText !== deleteTarget.full_name
                  }
                >
                  {deletingMember ? "Đang xóa..." : "Xóa thành viên"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
