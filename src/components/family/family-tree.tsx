"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Link2, Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useLockTouchGestures } from "@/hooks/use-lock-touch-gestures";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Member, Relationship } from "@/types/database";

type AddMode = "root" | "child" | "spouse" | "link";

type Props = {
  familyId: string;
  members: Member[];
  relationships: Relationship[];
  onChanged: () => void;
};

type MemberNodeData = {
  member: Member;
  depth: number;
  selected: boolean;
  onSelect: (member: Member) => void;
};

const NODE_W = 168;
const NODE_H = 64;

const MemberNode = memo(function MemberNode({ data }: NodeProps<Node<MemberNodeData>>) {
  const m = data.member;
  return (
    <button
      type="button"
      onClick={() => data.onSelect(m)}
      className={cn(
        "w-[168px] touch-none rounded-md border bg-card px-2.5 py-2 text-left shadow-sm transition-colors",
        data.selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/50",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2.5 !h-2.5" />
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Đời {data.depth}
      </p>
      <p className="text-sm font-medium leading-tight">{m.full_name}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2.5 !h-2.5" />
    </button>
  );
});

const nodeTypes = { member: MemberNode };

function computeDepths(members: Member[], relationships: Relationship[]) {
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const r of relationships) {
    if (r.relation_type !== "parent_child") continue;
    if (!childrenOf.has(r.person_a)) childrenOf.set(r.person_a, []);
    childrenOf.get(r.person_a)!.push(r.person_b);
    hasParent.add(r.person_b);
  }

  const depth = new Map<string, number>();
  const roots = members.filter((m) => !hasParent.has(m.id));

  function walk(id: string, d: number) {
    const prev = depth.get(id);
    if (prev != null && prev <= d) return;
    depth.set(id, d);
    for (const child of childrenOf.get(id) ?? []) {
      walk(child, d + 1);
    }
  }

  roots.forEach((r) => walk(r.id, r.generation ?? 1));
  members.forEach((m) => {
    if (!depth.has(m.id)) depth.set(m.id, m.generation ?? 1);
  });

  return { depth, hasParent, childrenOf, roots };
}

function layoutWithDagre(
  members: Member[],
  relationships: Relationship[],
  depths: Map<string, number>,
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 36,
    ranksep: 72,
    marginx: 16,
    marginy: 16,
  });

  for (const m of members) {
    g.setNode(m.id, { width: NODE_W, height: NODE_H });
  }

  for (const r of relationships) {
    if (r.relation_type === "parent_child") {
      g.setEdge(r.person_a, r.person_b);
    }
  }

  // Spouses: keep same rank by not creating vertical edges;
  // dagre will place disconnected spouses near after we set parent edges.
  // Add invisible same-rank hint via rank constraints isn't direct;
  // place spouse next to partner after layout.

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const m of members) {
    const node = g.node(m.id);
    if (node) {
      positions.set(m.id, {
        x: node.x - NODE_W / 2,
        y: node.y - NODE_H / 2,
      });
    } else {
      const d = depths.get(m.id) ?? 1;
      positions.set(m.id, { x: 0, y: (d - 1) * (NODE_H + 90) });
    }
  }

  // Nudge spouses horizontally beside primary partner
  for (const r of relationships) {
    if (r.relation_type !== "spouse") continue;
    const a = positions.get(r.person_a);
    const b = positions.get(r.person_b);
    if (!a || !b) continue;
    const y = Math.min(a.y, b.y);
    a.y = y;
    b.y = y;
    if (Math.abs(a.x - b.x) < NODE_W) {
      b.x = a.x + NODE_W + 40;
    }
  }

  return positions;
}

export function FamilyTree({ familyId, members, relationships, onChanged }: Props) {
  const canvasRef = useLockTouchGestures<HTMLDivElement>();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>("root");
  const [fullName, setFullName] = useState("");
  const [linkChildId, setLinkChildId] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = members.find((m) => m.id === selectedId) ?? null;
  const { depth, hasParent } = useMemo(
    () => computeDepths(members, relationships),
    [members, relationships],
  );

  const orphans = useMemo(
    () => members.filter((m) => !hasParent.has(m.id) && m.id !== selectedId),
    [members, hasParent, selectedId],
  );

  useEffect(() => {
    if (selectedId && !members.some((m) => m.id === selectedId)) {
      setSelectedId(null);
    }
  }, [members, selectedId]);

  const onSelect = useCallback((member: Member) => {
    setSelectedId(member.id);
  }, []);

  // Keep dagre off the selection path — recalculating layout mid-gesture causes lag on iOS.
  const positions = useMemo(
    () => layoutWithDagre(members, relationships, depth),
    [members, relationships, depth],
  );

  const edges = useMemo((): Edge[] => {
    return relationships.map((r) => {
      if (r.relation_type === "parent_child") {
        return {
          id: r.id,
          source: r.person_a,
          target: r.person_b,
          type: "smoothstep",
          animated: false,
          style: { stroke: "#46573f", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#46573f",
            width: 16,
            height: 16,
          },
        };
      }
      return {
        id: r.id,
        source: r.person_a,
        target: r.person_b,
        type: "straight",
        style: { stroke: "#8a7a5a", strokeWidth: 1.5, strokeDasharray: "6 4" },
        label: "vợ/chồng",
        labelStyle: { fontSize: 10, fill: "#6b675f" },
      };
    });
  }, [relationships]);

  const nodes = useMemo((): Node[] => {
    return members.map((member) => {
      const pos = positions.get(member.id) ?? { x: 0, y: 0 };
      return {
        id: member.id,
        type: "member",
        position: pos,
        selected: member.id === selectedId,
        data: {
          member,
          depth: depth.get(member.id) ?? member.generation ?? 1,
          selected: member.id === selectedId,
          onSelect,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });
  }, [members, positions, depth, selectedId, onSelect]);

  function openAdd(nextMode: AddMode) {
    if ((nextMode === "child" || nextMode === "spouse" || nextMode === "link") && !selected) {
      toast.error("Hãy chọn một người trên cây trước");
      return;
    }
    setMode(nextMode);
    setFullName("");
    setLinkChildId("");
    setDialogOpen(true);
  }

  async function submitAdd(e: React.FormEvent, forcedMode?: AddMode) {
    e.preventDefault();
    const activeMode = forcedMode ?? mode;

    if (activeMode !== "root" && activeMode !== "link" && !selected) {
      toast.error("Hãy chọn một người trên cây trước");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      if (activeMode === "link") {
        if (!selected || !linkChildId) {
          toast.error("Chọn người con để nối");
          setSaving(false);
          return;
        }
        if (linkChildId === selected.id) {
          toast.error("Không thể tự nối với chính mình");
          setSaving(false);
          return;
        }
        const childDepth = (depth.get(selected.id) ?? selected.generation ?? 1) + 1;
        const { error: relError } = await supabase.from("relationships").insert({
          family_id: familyId,
          person_a: selected.id,
          person_b: linkChildId,
          relation_type: "parent_child",
        });
        if (relError) throw relError;
        await supabase
          .from("members")
          .update({ generation: childDepth, updated_at: new Date().toISOString() })
          .eq("id", linkChildId);
        toast.success("Đã nối vào cây");
        setDialogOpen(false);
        onChanged();
        setSaving(false);
        return;
      }

      const name = fullName.trim();
      if (!name) {
        toast.error("Nhập họ tên");
        setSaving(false);
        return;
      }

      let generation = 1;
      if (activeMode === "child" && selected) {
        generation = (depth.get(selected.id) ?? selected.generation ?? 1) + 1;
      } else if (activeMode === "spouse" && selected) {
        generation = depth.get(selected.id) ?? selected.generation ?? 1;
      }

      const { data: created, error } = await supabase
        .from("members")
        .insert({
          family_id: familyId,
          full_name: name,
          generation,
          is_alive: true,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (activeMode === "child" && selected) {
        const { error: relError } = await supabase.from("relationships").insert({
          family_id: familyId,
          person_a: selected.id,
          person_b: created.id,
          relation_type: "parent_child",
        });
        if (relError) throw relError;
        toast.success(`Đã thêm con của ${selected.full_name}`);
      } else if (activeMode === "spouse" && selected) {
        const { error: relError } = await supabase.from("relationships").insert({
          family_id: familyId,
          person_a: selected.id,
          person_b: created.id,
          relation_type: "spouse",
        });
        if (relError) throw relError;
        toast.success(`Đã thêm vợ/chồng của ${selected.full_name}`);
      } else {
        toast.success("Đã thêm đời đầu (cao tổ)");
      }

      setSelectedId(created.id as string);
      setDialogOpen(false);
      setFullName("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  const dialogTitle =
    mode === "root"
      ? "Thêm đời đầu (cao tổ)"
      : mode === "child"
        ? `Thêm con của ${selected?.full_name ?? ""}`
        : mode === "spouse"
          ? `Thêm vợ/chồng của ${selected?.full_name ?? ""}`
          : `Nối con vào ${selected?.full_name ?? ""}`;

  if (members.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-8">
        <h3 className="font-serif text-xl">Bắt đầu cây gia phả</h3>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Thêm cao tổ ở đời 1 (trên cùng). Sau đó chọn người đó → Thêm con để tạo đời dưới, nối bằng đường kẻ.
        </p>
        <form
          onSubmit={(e) => void submitAdd(e, "root")}
          className="mt-6 max-w-md space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="root-name">Họ và tên cao tổ</Label>
            <Input
              id="root-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Cao tổ Lê Văn Đại Lang"
              required
              autoFocus
            />
          </div>
          <Button type="submit" disabled={saving}>
            <Plus className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Tạo đời 1"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-12 z-20 -mx-3 space-y-2 border-b border-border/80 bg-background/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-md sm:border sm:border-border sm:bg-card sm:px-4 sm:py-4 sm:backdrop-blur-none">
        <div>
          <p className="text-sm font-medium">
            {selected
              ? `Đang chọn: ${selected.full_name} (đời ${depth.get(selected.id) ?? selected.generation ?? 1})`
              : "Chạm 1 người trên cây, rồi thêm con"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vuốt để xem · chụm ngón để zoom · cây từ trên xuống
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => openAdd("root")}>
            <Plus className="h-4 w-4" />
            Đời 1
          </Button>
          <Button size="sm" className="w-full sm:w-auto" disabled={!selected} onClick={() => openAdd("child")}>
            <UserPlus className="h-4 w-4" />
            Thêm con
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!selected}
            onClick={() => openAdd("spouse")}
          >
            <Users className="h-4 w-4" />
            Vợ/chồng
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!selected || orphans.length === 0}
            onClick={() => openAdd("link")}
          >
            <Link2 className="h-4 w-4" />
            Nối cây
          </Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative z-10 h-[min(70vh,560px)] touch-none overscroll-none overflow-hidden rounded-md border border-border bg-[#faf8f4] sm:h-[640px]"
        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.28, maxZoom: 1.1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnPinch
          zoomOnScroll={false}
          panOnScroll={false}
          preventScrolling
          onlyRenderVisibleElements
          minZoom={0.15}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            const member = members.find((m) => m.id === node.id);
            if (member) setSelectedId(member.id);
          }}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background gap={24} color="#ddd8ce" />
          <Controls showInteractive={false} />
          <MiniMap className="hidden sm:block" pannable zoomable />
        </ReactFlow>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent title={dialogTitle}>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {mode === "child" && selected
                ? `Sẽ nằm dưới ${selected.full_name}, đời ${(depth.get(selected.id) ?? 1) + 1}.`
                : mode === "spouse" && selected
                  ? `Ngang hàng với ${selected.full_name}.`
                  : mode === "link"
                    ? "Chọn thành viên chưa có cha/mẹ trên cây để nối xuống dưới người đang chọn."
                    : "Thêm người ở đỉnh cây (đời 1)."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitAdd(e)} className="space-y-4">
            {mode === "link" ? (
              <div className="space-y-2">
                <Label>Người con (chưa nối)</Label>
                <Select
                  value={linkChildId}
                  onChange={(e) => setLinkChildId(e.target.value)}
                  required
                >
                  <option value="">Chọn...</option>
                  {orphans.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="add-name">Họ và tên</Label>
                <Input
                  id="add-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Họ và tên"
                  required
                  autoFocus
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
