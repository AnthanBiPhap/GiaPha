export type Gender = "male" | "female" | "other";
export type RelationType = "parent_child" | "spouse" | "sibling";
export type EventType =
  | "birth"
  | "death"
  | "marriage"
  | "migration"
  | "anniversary"
  | string;

export type Family = {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
};

export type Member = {
  id: string;
  family_id: string;
  full_name: string;
  gender: Gender | null;
  birth_date: string | null;
  death_date: string | null;
  is_alive: boolean | null;
  generation: number | null;
  avatar_url: string | null;
  bio: string | null;
  birth_place: string | null;
  birth_lat: number | null;
  birth_lng: number | null;
  death_place: string | null;
  death_lat: number | null;
  death_lng: number | null;
  current_place: string | null;
  current_lat: number | null;
  current_lng: number | null;
  created_at: string;
  updated_at: string;
};

export type MemberPhoto = {
  id: string;
  family_id: string;
  member_id: string;
  url: string;
  storage_path: string | null;
  caption: string | null;
  created_at: string;
};

export type Relationship = {
  id: string;
  family_id: string;
  person_a: string;
  person_b: string;
  relation_type: RelationType;
  created_at: string;
};

export type FamilyEvent = {
  id: string;
  family_id: string;
  member_id: string | null;
  event_type: EventType | null;
  event_date: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  created_at: string;
};

export type MemberFormValues = {
  full_name: string;
  current_place: string;
  current_lat: string;
  current_lng: string;
  note: string;
};
