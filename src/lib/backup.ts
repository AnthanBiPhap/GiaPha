import { createClient } from "@/lib/supabase/client";
import type {
  Family,
  FamilyEvent,
  Member,
  MemberPhoto,
  Relationship,
} from "@/types/database";

export const BACKUP_VERSION = 1;

export type FamilyBackupPayload = {
  family: Pick<Family, "name"> & { original_id?: string };
  members: Omit<Member, "family_id" | "created_at" | "updated_at">[];
  relationships: Omit<Relationship, "family_id" | "created_at">[];
  events: Omit<FamilyEvent, "family_id" | "created_at">[];
  photos: Omit<MemberPhoto, "family_id" | "created_at">[];
};

export type AppBackupFile = {
  version: number;
  app: string;
  exported_at: string;
  families: FamilyBackupPayload[];
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Lấy toàn bộ dữ liệu 1 dòng họ để sao lưu */
export async function buildFamilyBackup(familyId: string): Promise<FamilyBackupPayload> {
  const supabase = createClient();
  const [familyRes, membersRes, relRes, eventsRes, photosRes] = await Promise.all([
    supabase.from("families").select("*").eq("id", familyId).single(),
    supabase.from("members").select("*").eq("family_id", familyId),
    supabase.from("relationships").select("*").eq("family_id", familyId),
    supabase.from("events").select("*").eq("family_id", familyId),
    supabase.from("member_photos").select("*").eq("family_id", familyId),
  ]);

  if (familyRes.error) throw new Error(familyRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (relRes.error) throw new Error(relRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (photosRes.error) throw new Error(photosRes.error.message);

  const family = familyRes.data as Family;
  const members = (membersRes.data as Member[]) ?? [];
  const relationships = (relRes.data as Relationship[]) ?? [];
  const events = (eventsRes.data as FamilyEvent[]) ?? [];
  const photos = (photosRes.data as MemberPhoto[]) ?? [];

  return {
    family: { name: family.name, original_id: family.id },
    members: members.map((m) => ({
      id: m.id,
      full_name: m.full_name,
      gender: m.gender,
      birth_date: m.birth_date,
      death_date: m.death_date,
      is_alive: m.is_alive,
      generation: m.generation,
      avatar_url: m.avatar_url,
      bio: m.bio,
      birth_place: m.birth_place,
      birth_lat: m.birth_lat,
      birth_lng: m.birth_lng,
      death_place: m.death_place,
      death_lat: m.death_lat,
      death_lng: m.death_lng,
      current_place: m.current_place,
      current_lat: m.current_lat,
      current_lng: m.current_lng,
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      person_a: r.person_a,
      person_b: r.person_b,
      relation_type: r.relation_type,
    })),
    events: events.map((e) => ({
      id: e.id,
      member_id: e.member_id,
      event_type: e.event_type,
      event_date: e.event_date,
      location: e.location,
      lat: e.lat,
      lng: e.lng,
      description: e.description,
    })),
    photos: photos.map((p) => ({
      id: p.id,
      member_id: p.member_id,
      url: p.url,
      storage_path: p.storage_path,
      caption: p.caption,
    })),
  };
}

export async function downloadFamilyBackup(familyId: string, familyName: string) {
  const payload = await buildFamilyBackup(familyId);
  const file: AppBackupFile = {
    version: BACKUP_VERSION,
    app: "Gia Phả Cao Tổ",
    exported_at: new Date().toISOString(),
    families: [payload],
  };
  const safe = familyName.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim().replace(/\s+/g, "-") || "dong-ho";
  downloadJson(`giapha-backup-${safe}-${stamp()}.json`, file);
}

export async function downloadAllOwnedBackups(ownerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("families")
    .select("id,name")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const families = data ?? [];
  if (families.length === 0) throw new Error("Chưa có dòng họ để sao lưu");

  const payloads: FamilyBackupPayload[] = [];
  for (const f of families) {
    payloads.push(await buildFamilyBackup(f.id));
  }

  const file: AppBackupFile = {
    version: BACKUP_VERSION,
    app: "Gia Phả Cao Tổ",
    exported_at: new Date().toISOString(),
    families: payloads,
  };
  downloadJson(`giapha-backup-tat-ca-${stamp()}.json`, file);
  return families.length;
}

export function parseBackupFile(text: string): AppBackupFile {
  const raw = JSON.parse(text) as AppBackupFile;
  if (!raw || raw.version !== BACKUP_VERSION || !Array.isArray(raw.families)) {
    throw new Error("File backup không hợp lệ hoặc phiên bản không hỗ trợ");
  }
  if (raw.families.length === 0) throw new Error("File backup trống");
  return raw;
}

function newId() {
  return crypto.randomUUID();
}

/**
 * Khôi phục backup thành dòng họ mới (ID mới).
 * Ảnh giữ URL cũ trên Storage — nếu file ảnh còn trên Supabase thì vẫn xem được.
 */
export async function restoreBackupAsNewFamilies(
  backup: AppBackupFile,
  ownerId: string,
): Promise<number> {
  const supabase = createClient();
  let created = 0;

  for (const pack of backup.families) {
    const name = `${pack.family.name} (khôi phục)`;
    const { data: family, error: famErr } = await supabase
      .from("families")
      .insert({ name, owner_id: ownerId })
      .select("id")
      .single();
    if (famErr) throw new Error(famErr.message);
    const familyId = family.id as string;

    const idMap = new Map<string, string>();
    for (const m of pack.members) {
      idMap.set(m.id, newId());
    }

    if (pack.members.length > 0) {
      const rows = pack.members.map((m) => ({
        id: idMap.get(m.id)!,
        family_id: familyId,
        full_name: m.full_name,
        gender: m.gender,
        birth_date: m.birth_date,
        death_date: m.death_date,
        is_alive: m.is_alive,
        generation: m.generation,
        avatar_url: m.avatar_url,
        bio: m.bio,
        birth_place: m.birth_place,
        birth_lat: m.birth_lat,
        birth_lng: m.birth_lng,
        death_place: m.death_place,
        death_lat: m.death_lat,
        death_lng: m.death_lng,
        current_place: m.current_place,
        current_lat: m.current_lat,
        current_lng: m.current_lng,
      }));
      const { error } = await supabase.from("members").insert(rows);
      if (error) throw new Error(error.message);
    }

    if (pack.relationships.length > 0) {
      const rows = pack.relationships
        .map((r) => {
          const a = idMap.get(r.person_a);
          const b = idMap.get(r.person_b);
          if (!a || !b) return null;
          return {
            id: newId(),
            family_id: familyId,
            person_a: a,
            person_b: b,
            relation_type: r.relation_type,
          };
        })
        .filter(Boolean);
      if (rows.length > 0) {
        const { error } = await supabase.from("relationships").insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    if (pack.events.length > 0) {
      const rows = pack.events.map((e) => ({
        id: newId(),
        family_id: familyId,
        member_id: e.member_id ? (idMap.get(e.member_id) ?? null) : null,
        event_type: e.event_type,
        event_date: e.event_date,
        location: e.location,
        lat: e.lat,
        lng: e.lng,
        description: e.description,
      }));
      const { error } = await supabase.from("events").insert(rows);
      if (error) throw new Error(error.message);
    }

    if (pack.photos.length > 0) {
      const rows = pack.photos
        .map((p) => {
          const memberId = idMap.get(p.member_id);
          if (!memberId) return null;
          return {
            id: newId(),
            family_id: familyId,
            member_id: memberId,
            url: p.url,
            storage_path: p.storage_path,
            caption: p.caption,
          };
        })
        .filter(Boolean);
      if (rows.length > 0) {
        const { error } = await supabase.from("member_photos").insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    created += 1;
  }

  return created;
}
