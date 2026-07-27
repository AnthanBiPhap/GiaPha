"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { FamilyEvent, Member } from "@/types/database";

const EVENT_LABELS: Record<string, string> = {
  birth: "Sinh",
  death: "Mất",
  marriage: "Cưới",
  migration: "Di cư",
  anniversary: "Giỗ / kỷ niệm",
};

type Props = {
  events: FamilyEvent[];
  members: Member[];
};

export function FamilyTimeline({ events, members }: Props) {
  const nameById = new Map(members.map((m) => [m.id, m.full_name]));
  const sorted = [...events].sort((a, b) => {
    const da = a.event_date ?? "";
    const db = b.event_date ?? "";
    return da.localeCompare(db);
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có sự kiện. Thêm vào bảng events trên Supabase hoặc mở rộng form sau.
      </div>
    );
  }

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {sorted.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[29px] top-1.5 h-3 w-3 rounded-full border border-primary bg-card" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              {EVENT_LABELS[event.event_type ?? ""] ?? event.event_type ?? "Sự kiện"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatDate(event.event_date)}
            </span>
          </div>
          <p className="mt-1 font-medium">
            {event.member_id ? nameById.get(event.member_id) ?? "Thành viên" : "Dòng họ"}
          </p>
          {event.location && (
            <p className="text-sm text-muted-foreground">{event.location}</p>
          )}
          {event.description && (
            <p className="mt-1 text-sm">{event.description}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
