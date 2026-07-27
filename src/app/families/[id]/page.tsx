"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreventPageReloadGestures } from "@/hooks/use-lock-touch-gestures";
import { createClient } from "@/lib/supabase/client";
import type {
  Family,
  FamilyEvent,
  Member,
  MemberPhoto,
  RelationType,
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
  const [relationOpen, setRelationOpen] = useState(false);
  const [personA, setPersonA] = useState("");
  const [personB, setPersonB] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("parent_child");
  const [savingRelation, setSavingRelation] = useState(false);
  const [tab, setTab] = useState("tree");

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

  async function deleteMember(member: Member) {
    if (!confirm(`Xóa thành viên ${member.full_name}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("members").delete().eq("id", member.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa thành viên");
    refresh();
  }

  async function createRelation(e: React.FormEvent) {
    e.preventDefault();
    if (!personA || !personB || personA === personB) {
      toast.error("Chọn hai thành viên khác nhau");
      return;
    }
    setSavingRelation(true);
    const supabase = createClient();
    const { error } = await supabase.from("relationships").insert({
      family_id: familyId,
      person_a: personA,
      person_b: personB,
      relation_type: relationType,
    });
    setSavingRelation(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã thêm quan hệ");
    setRelationOpen(false);
    setPersonA("");
    setPersonB("");
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

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
      <div className="flex flex-col gap-4">
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
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRelationOpen(true)}>
            Thêm quan hệ
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setMemberOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Thêm thành viên
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} defaultValue="tree" className="mt-6 sm:mt-8">
        <TabsList>
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
                  Chưa có thành viên. Bấm &quot;Thêm thành viên&quot; để nhập tên và ảnh bia mộ.
                </CardContent>
              </Card>
            )}
            {filteredMembers.map((member) => {
              const memberPhotos = photosByMember.get(member.id) ?? [];
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
                        </p>
                      </div>
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
                          onClick={() => void deleteMember(member)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

        <TabsContent value="tree">
          <FamilyTree
            familyId={familyId}
            members={members}
            relationships={relationships}
            onChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="map">
          <FamilyMap members={members} />
        </TabsContent>

        <TabsContent value="timeline">
          <FamilyTimeline events={events} members={members} />
        </TabsContent>
      </Tabs>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent title={editing ? "Sửa thành viên" : "Thêm thành viên"}>
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
        </DialogContent>
      </Dialog>

      <Dialog open={relationOpen} onOpenChange={setRelationOpen}>
        <DialogContent title="Thêm quan hệ">
          <DialogHeader>
            <DialogTitle>Thêm quan hệ</DialogTitle>
            <DialogDescription>
              Với quan hệ cha/mẹ–con: chọn cha/mẹ ở A, con ở B.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createRelation} className="space-y-4">
            <div className="space-y-2">
              <Label>Người A</Label>
              <Select value={personA} onChange={(e) => setPersonA(e.target.value)} required>
                <option value="">Chọn...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Người B</Label>
              <Select value={personB} onChange={(e) => setPersonB(e.target.value)} required>
                <option value="">Chọn...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loại quan hệ</Label>
              <Select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value as RelationType)}
              >
                <option value="parent_child">Cha/mẹ – con</option>
                <option value="spouse">Vợ/chồng</option>
                <option value="sibling">Anh/chị/em</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRelationOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={savingRelation}>
                {savingRelation ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
