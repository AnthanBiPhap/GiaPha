"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Pencil, Plus, Search, UserPlus, X } from "lucide-react";
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
import { useLockTouchGestures } from "@/hooks/use-lock-touch-gestures";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Member, Relationship } from "@/types/database";

type AddMode = "root" | "child";

type Props = {
  familyId: string;
  members: Member[];
  relationships: Relationship[];
  onChanged: () => void;
  /** Mở form sửa thành viên đang chọn trên cây */
  onEditMember?: (member: Member) => void;
  /** Guest / non-owner: chỉ xem, ẩn thêm/sửa */
  canEdit?: boolean;
};

type MemberNodeData = {
  label: string;
  depth: number;
  selected: boolean;
};

const NODE_W = 148;
const NODE_H = 52;

const edgeOptions = {
  type: "smoothstep" as const,
  style: { stroke: "#46573f", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#46573f",
    width: 16,
    height: 16,
  },
};

const MemberNode = memo(function MemberNode({ data }: NodeProps<Node<MemberNodeData>>) {
  return (
    <div
      className={cn(
        "flex h-[52px] w-[148px] touch-none flex-col justify-center rounded border px-2 py-1.5 text-center",
        data.selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-primary"
      />
      <p className="text-[9px] leading-none text-muted-foreground">Đời {data.depth}</p>
      <p className="truncate text-xs font-medium leading-tight">{data.label}</p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-primary"
      />
    </div>
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

  return depth;
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
    nodesep: 28,
    ranksep: 56,
    marginx: 12,
    marginy: 12,
  });

  for (const m of members) {
    g.setNode(m.id, { width: NODE_W, height: NODE_H });
  }

  for (const r of relationships) {
    if (r.relation_type === "parent_child") {
      g.setEdge(r.person_a, r.person_b);
    }
  }

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
      positions.set(m.id, { x: 0, y: (d - 1) * (NODE_H + 70) });
    }
  }

  for (const r of relationships) {
    if (r.relation_type !== "spouse") continue;
    const a = positions.get(r.person_a);
    const b = positions.get(r.person_b);
    if (!a || !b) continue;
    const y = Math.min(a.y, b.y);
    a.y = y;
    b.y = y;
    if (Math.abs(a.x - b.x) < NODE_W) {
      b.x = a.x + NODE_W + 28;
    }
  }

  return positions;
}

function FitOnce() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 0.95, duration: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView]);
  return null;
}

/** Zoom/pan tới 1 node khi chọn từ ô tìm kiếm */
function FocusOnNode({
  nodeId,
  token,
}: {
  nodeId: string | null;
  token: number;
}) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!nodeId) return;
    const id = requestAnimationFrame(() => {
      void fitView({
        nodes: [{ id: nodeId }],
        padding: 0.45,
        maxZoom: 1.15,
        duration: 450,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [nodeId, token, fitView]);
  return null;
}

function FamilyTreeCanvas({
  nodes,
  edges,
  onSelectId,
  focusNodeId,
  focusToken,
}: {
  nodes: Node[];
  edges: Edge[];
  onSelectId: (id: string | null) => void;
  focusNodeId: string | null;
  focusToken: number;
}) {
  const canvasRef = useLockTouchGestures<HTMLDivElement>();

  return (
    <div
      ref={canvasRef}
      data-tree-canvas
      className="relative min-h-0 flex-1 touch-none overscroll-none overflow-hidden rounded-md border border-border bg-[#faf8f4]"
      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={edgeOptions}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        panOnDrag
        zoomOnPinch
        zoomOnDoubleClick={false}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling
        onlyRenderVisibleElements
        minZoom={0.12}
        maxZoom={1.35}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectId(node.id)}
        onPaneClick={() => onSelectId(null)}
        style={{ width: "100%", height: "100%" }}
      >
        <FitOnce />
        <FocusOnNode nodeId={focusNodeId} token={focusToken} />
        <Background gap={32} size={1} color="#e5e0d6" />
        <Controls showInteractive={false} showFitView showZoom />
      </ReactFlow>
    </div>
  );
}

export function FamilyTree({
  familyId,
  members,
  relationships,
  onChanged,
  onEditMember,
  canEdit = false,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>("child");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId],
  );

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => m.full_name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [members, searchQuery]);

  const depth = useMemo(
    () => computeDepths(members, relationships),
    [members, relationships],
  );

  useEffect(() => {
    if (selectedId && !members.some((m) => m.id === selectedId)) {
      setSelectedId(null);
    }
  }, [members, selectedId]);

  const positions = useMemo(
    () => layoutWithDagre(members, relationships, depth),
    [members, relationships, depth],
  );

  const edges = useMemo((): Edge[] => {
    const list: Edge[] = [];
    for (const r of relationships) {
      if (r.relation_type === "parent_child") {
        list.push({
          id: r.id,
          source: r.person_a,
          target: r.person_b,
          type: "smoothstep",
          style: { stroke: "#46573f", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#46573f",
            width: 16,
            height: 16,
          },
        });
      } else if (r.relation_type === "spouse") {
        list.push({
          id: r.id,
          source: r.person_a,
          target: r.person_b,
          type: "straight",
          style: { stroke: "#8a7a5a", strokeWidth: 1.5, strokeDasharray: "6 4" },
          label: "vợ/chồng",
          labelStyle: { fontSize: 10, fill: "#6b675f" },
        });
      }
    }
    return list;
  }, [relationships]);

  // Selection only flips a flag — do not rebuild layout data.
  const nodes = useMemo((): Node[] => {
    const q = searchQuery.trim().toLowerCase();
    return members.map((member) => {
      const pos = positions.get(member.id) ?? { x: 0, y: 0 };
      const match = !q || member.full_name.toLowerCase().includes(q);
      return {
        id: member.id,
        type: "member",
        position: pos,
        selected: member.id === selectedId,
        style: q
          ? { opacity: match ? 1 : 0.28, transition: "opacity 0.15s" }
          : undefined,
        data: {
          label: member.full_name,
          depth: depth.get(member.id) ?? member.generation ?? 1,
          selected: member.id === selectedId,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });
  }, [members, positions, depth, selectedId, searchQuery]);

  const onSelectId = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  function goToMember(member: Member) {
    setSelectedId(member.id);
    setFocusNodeId(member.id);
    setFocusToken((t) => t + 1);
    setSearchQuery(member.full_name);
    setSearchOpen(false);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchOpen(false);
    setFocusNodeId(null);
  }

  function openAdd(nextMode: AddMode) {
    if (nextMode === "child" && !selected) {
      toast.error("Hãy chọn một người trên cây trước");
      return;
    }
    setMode(nextMode);
    setFullName("");
    setDialogOpen(true);
  }

  async function submitAdd(e: React.FormEvent, forcedMode?: AddMode) {
    e.preventDefault();
    const activeMode = forcedMode ?? mode;

    if (activeMode === "child" && !selected) {
      toast.error("Hãy chọn một người trên cây trước");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      const name = fullName.trim();
      if (!name) {
        toast.error("Nhập họ tên");
        setSaving(false);
        return;
      }

      let generation = 1;
      if (activeMode === "child" && selected) {
        generation = (depth.get(selected.id) ?? selected.generation ?? 1) + 1;
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
    mode === "child"
      ? `Thêm con của ${selected?.full_name ?? ""}`
      : "Thêm đời đầu (cao tổ)";

  if (members.length === 0) {
    if (!canEdit) {
      return (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Cây gia phả chưa có thành viên.
        </div>
      );
    }
    return (
      <div className="rounded-md border border-border bg-card p-8">
        <h3 className="font-serif text-xl">Bắt đầu cây gia phả</h3>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Thêm cao tổ ở đời 1 (trên cùng). Sau đó chọn người đó → Thêm con để tạo đời dưới.
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 sm:h-[640px] sm:flex-none">
      <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {selected
                ? `${selected.full_name} · đời ${depth.get(selected.id) ?? selected.generation ?? 1}`
                : canEdit
                  ? "Chạm 1 người → Sửa hoặc Thêm con"
                  : "Chạm để xem · vuốt / zoom để duyệt cây"}
            </p>
            <p className="text-[11px] text-muted-foreground">Vuốt · chụm ngón để zoom</p>
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!selected}
                onClick={() => {
                  if (!selected) {
                    toast.error("Hãy chọn một người trên cây trước");
                    return;
                  }
                  onEditMember?.(selected);
                }}
              >
                <Pencil className="h-4 w-4" />
                Sửa
              </Button>
              <Button size="sm" disabled={!selected} onClick={() => openAdd("child")}>
                <UserPlus className="h-4 w-4" />
                Thêm con
              </Button>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 pr-8 text-sm"
            placeholder="Tìm theo tên trên cây..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            aria-label="Tìm thành viên trên cây"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {searchOpen && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-md">
              {searchHits.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Không tìm thấy.</p>
              ) : (
                <ul>
                  {searchHits.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                          m.id === selectedId && "bg-primary/10",
                        )}
                        onClick={() => goToMember(m)}
                      >
                        <span className="truncate font-medium">{m.full_name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          Đời {depth.get(m.id) ?? m.generation ?? 1}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <ReactFlowProvider>
        <FamilyTreeCanvas
          nodes={nodes}
          edges={edges}
          onSelectId={onSelectId}
          focusNodeId={focusNodeId}
          focusToken={focusToken}
        />
      </ReactFlowProvider>

      {canEdit && (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent title={dialogTitle}>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {selected
                ? `Sẽ nằm dưới ${selected.full_name}, đời ${(depth.get(selected.id) ?? 1) + 1}.`
                : "Thêm người vào cây."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitAdd(e)} className="space-y-4">
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
      )}
    </div>
  );
}
