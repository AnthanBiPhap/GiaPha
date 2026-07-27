import type { Member, MemberFormValues } from "@/types/database";

export const emptyMemberForm = (): MemberFormValues => ({
  full_name: "",
  current_place: "",
  current_lat: "",
  current_lng: "",
  note: "",
});

export function memberToForm(member: Member): MemberFormValues {
  return {
    full_name: member.full_name ?? "",
    current_place: member.current_place ?? "",
    current_lat: member.current_lat?.toString() ?? "",
    current_lng: member.current_lng?.toString() ?? "",
    note: member.bio ?? "",
  };
}

function numOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formToPayload(form: MemberFormValues, familyId: string) {
  if (!form.full_name.trim()) {
    throw new Error("Họ tên là bắt buộc");
  }

  return {
    family_id: familyId,
    full_name: form.full_name.trim(),
    bio: form.note.trim() || null,
    current_place: form.current_place.trim() || null,
    current_lat: numOrNull(form.current_lat),
    current_lng: numOrNull(form.current_lng),
    updated_at: new Date().toISOString(),
  };
}
