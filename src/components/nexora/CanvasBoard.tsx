import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eraser,
  Highlighter,
  Link2,
  MousePointer2,
  Pencil,
  PenTool,
  Redo2,
  Search,
  StickyNote,
  Type,
  Undo2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/nexora/Bits";
import type {
  CanvasEdge,
  CanvasEdgeKind,
  CanvasMap,
  CanvasNode,
  CanvasStroke,
  CaseBundle,
} from "@/lib/nexora/types";

type Tool = "select" | "connect" | "pencil" | "pen" | "highlighter" | "eraser" | "text" | "sticky" | "group";

const TOOLS: { id: Tool; label: string; icon: typeof Pencil; hint: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Select, move and edit points or annotations" },
  { id: "connect", label: "Connect", icon: Link2, hint: "Click two points to create a relationship" },
  { id: "pencil", label: "Pencil", icon: Pencil, hint: "Freehand sketching" },
  { id: "pen", label: "Pen", icon: PenTool, hint: "Clean permanent lines and arrows" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, hint: "Semi-transparent highlighting" },
  { id: "eraser", label: "Eraser", icon: Eraser, hint: "Erase pencil / pen / highlighter annotations" },
  { id: "text", label: "Text", icon: Type, hint: "Add a label or explanation" },
  { id: "sticky", label: "Sticky note", icon: StickyNote, hint: "Movable investigation note" },
  { id: "group", label: "Group", icon: Users, hint: "Create a labelled group frame" },
];

const EDGE_COLOR: Record<CanvasEdgeKind, string> = {
  EVIDENCE: "#22c55e",
  HYPOTHESIS: "#eab308",
  CONTRADICTION: "#ef4444",
};

const STROKE_STYLE: Record<"pencil" | "pen" | "highlighter", { color: string; width: number; opacity: number }> = {
  pencil: { color: "#9ca3af", width: 2, opacity: 0.95 },
  pen: { color: "#5eead4", width: 3, opacity: 1 },
  highlighter: { color: "#facc15", width: 18, opacity: 0.28 },
};

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface Snap {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
}

export function CanvasBoard({
  bundle,
  investigator,
  map,
  onSave,
  onExport,
}: {
  bundle: CaseBundle;
  investigator: string;
  map: CanvasMap;
  onSave: (m: CanvasMap, snapshot: string | null) => void;
  onExport: (dataUrl: string) => void;
}) {
  const [name, setName] = useState(map.name);
  const [nodes, setNodes] = useState<CanvasNode[]>(map.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(map.edges);
  const [strokes, setStrokes] = useState<CanvasStroke[]>(map.strokes);
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [sel, setSel] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ mode: "node" | "pan" | "draw" | "erase"; id?: string; dx?: number; dy?: number } | null>(null);
  const liveStroke = useRef<CanvasStroke | null>(null);
  const [liveVersion, setLiveVersion] = useState(0);

  useEffect(() => {
    setName(map.name);
    setNodes(map.nodes);
    setEdges(map.edges);
    setStrokes(map.strokes);
    setPast([]);
    setFuture([]);
    setSel(null);
  }, [map]);

  const snap = useCallback((): Snap => ({ nodes, edges, strokes }), [nodes, edges, strokes]);
  const commit = useCallback(
    (next: Partial<Snap>) => {
      setPast((p) => [...p.slice(-49), snap()]);
      setFuture([]);
      if (next.nodes) setNodes(next.nodes);
      if (next.edges) setEdges(next.edges);
      if (next.strokes) setStrokes(next.strokes);
    },
    [snap],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1]!;
      setFuture((f) => [{ nodes, edges, strokes }, ...f]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setStrokes(prev.strokes);
      return p.slice(0, -1);
    });
  }, [nodes, edges, strokes]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0]!;
      setPast((p) => [...p, { nodes, edges, strokes }]);
      setNodes(next.nodes);
      setEdges(next.edges);
      setStrokes(next.strokes);
      return f.slice(1);
    });
  }, [nodes, edges, strokes]);

  /* ---------- wheel zoom (non-passive) ---------- */
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const v = viewRef.current;
      const next = Math.min(4, Math.max(0.2, v.z * Math.exp(-dy * 0.0015)));
      const k = next / v.z;
      setView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, z: next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.z, y: (clientY - rect.top - v.y) / v.z };
  }, []);

  /* ---------- entity palette ---------- */
  const palette = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.entities
      .filter((e) => !q || e.label.toLowerCase().includes(q) || e.kind.includes(q) || e.value.toLowerCase().includes(q))
      .slice(0, 400);
  }, [bundle.entities, query]);

  const addEntityNode = useCallback(
    (entityId: string, at?: { x: number; y: number }) => {
      const e = bundle.entities.find((x) => x.id === entityId);
      if (!e) return;
      if (nodes.some((n) => n.entityId === entityId)) {
        toast.info(`${e.label} is already on this canvas`);
        return;
      }
      const pos = at ?? { x: 120 + Math.random() * 400, y: 120 + Math.random() * 300 };
      const node: CanvasNode = {
        id: rid("CN"),
        kind: "entity",
        entityId: e.id,
        entityKind: e.kind,
        label: e.label,
        x: pos.x,
        y: pos.y,
        evidenceIds: e.artifactIds.slice(0, 40),
        investigator,
        ts: Date.now(),
      };
      commit({ nodes: [...nodes, node] });
    },
    [bundle.entities, nodes, commit, investigator],
  );

  /* ---------- connecting ---------- */
  const makeEdge = useCallback(
    (fromId: string, toId: string) => {
      const a = nodes.find((n) => n.id === fromId);
      const b = nodes.find((n) => n.id === toId);
      if (!a || !b || a.id === b.id) return;
      const real =
        a.entityId && b.entityId
          ? bundle.links.find(
              (l) =>
                (l.from === a.entityId && l.to === b.entityId) || (l.to === a.entityId && l.from === b.entityId),
            )
          : undefined;
      const conflict =
        a.entityId && b.entityId
          ? bundle.contradictions.find(
              (c) =>
                [c.sideA.evidenceId, c.sideB.evidenceId].some((id) => a.evidenceIds.includes(id)) &&
                [c.sideA.evidenceId, c.sideB.evidenceId].some((id) => b.evidenceIds.includes(id)),
            )
          : undefined;
      const kind: CanvasEdgeKind = real ? "EVIDENCE" : conflict ? "CONTRADICTION" : "HYPOTHESIS";
      const edge: CanvasEdge = {
        id: rid("CE"),
        from: a.id,
        to: b.id,
        kind,
        label: real ? real.type : conflict ? conflict.kind : "investigator hypothesis",
        linkId: real?.id ?? null,
        evidenceIds: real ? real.evidenceIds : conflict ? [conflict.sideA.evidenceId, conflict.sideB.evidenceId] : [],
        source: real ? real.method : conflict ? conflict.summary : null,
        ts: real
          ? (bundle.artifacts.find((x) => x.id === real.evidenceIds[0])?.ts ?? null)
          : (conflict?.sideA.ts ?? null),
        confidence: real ? real.confidence : null,
        investigator,
        createdAt: Date.now(),
      };
      commit({ edges: [...edges, edge] });
      setSel({ type: "edge", id: edge.id });
    },
    [nodes, edges, bundle, commit, investigator],
  );

  /* ---------- pointer handling ---------- */
  function onNodePointerDown(e: React.PointerEvent, node: CanvasNode) {
    if (tool === "connect") {
      e.stopPropagation();
      if (!connectFrom) setConnectFrom(node.id);
      else {
        makeEdge(connectFrom, node.id);
        setConnectFrom(null);
      }
      return;
    }
    if (tool !== "select") return;
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { mode: "node", id: node.id, dx: w.x - node.x, dy: w.y - node.y };
    setPast((p) => [...p.slice(-49), snap()]);
    setFuture([]);
    setSel({ type: "node", id: node.id });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onSurfacePointerDown(e: React.PointerEvent) {
    const w = toWorld(e.clientX, e.clientY);
    if (tool === "pencil" || tool === "pen" || tool === "highlighter") {
      const st = STROKE_STYLE[tool];
      liveStroke.current = {
        id: rid("CS"),
        tool,
        points: [w.x, w.y],
        color: st.color,
        width: st.width,
        investigator,
        ts: Date.now(),
      };
      drag.current = { mode: "draw" };
      setLiveVersion((v) => v + 1);
      return;
    }
    if (tool === "eraser") {
      drag.current = { mode: "erase" };
      eraseAt(w);
      return;
    }
    if (tool === "text" || tool === "sticky" || tool === "group") {
      const label = window.prompt(
        tool === "group" ? "Group label" : tool === "sticky" ? "Sticky note text" : "Text annotation",
      );
      if (!label?.trim()) return;
      const node: CanvasNode = {
        id: rid("CN"),
        kind: tool,
        entityId: null,
        entityKind: null,
        label: label.trim(),
        x: w.x,
        y: w.y,
        ...(tool === "group" ? { w: 320, h: 220 } : {}),
        evidenceIds: [],
        investigator,
        ts: Date.now(),
      };
      commit({ nodes: [...nodes, node] });
      return;
    }
    setSel(null);
    setConnectFrom(null);
    drag.current = { mode: "pan", dx: e.clientX - view.x, dy: e.clientY - view.y };
  }

  const erasedRef = useRef(false);
  function eraseAt(w: { x: number; y: number }) {
    const r = 14 / viewRef.current.z;
    const keep = strokes.filter((s) => {
      for (let i = 0; i < s.points.length; i += 2) {
        const dx = (s.points[i] ?? 0) - w.x;
        const dy = (s.points[i + 1] ?? 0) - w.y;
        if (Math.hypot(dx, dy) < r + s.width / 2) return false;
      }
      return true;
    });
    if (keep.length !== strokes.length) {
      if (!erasedRef.current) {
        setPast((p) => [...p.slice(-49), snap()]);
        setFuture([]);
        erasedRef.current = true;
      }
      setStrokes(keep);
    }
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView((v) => ({ ...v, x: e.clientX - (d.dx ?? 0), y: e.clientY - (d.dy ?? 0) }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.mode === "node" && d.id) {
      setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x: w.x - (d.dx ?? 0), y: w.y - (d.dy ?? 0) } : n)));
      return;
    }
    if (d.mode === "draw" && liveStroke.current) {
      liveStroke.current.points.push(w.x, w.y);
      setLiveVersion((v) => v + 1);
      return;
    }
    if (d.mode === "erase") eraseAt(w);
  }

  function onSurfacePointerUp() {
    const d = drag.current;
    drag.current = null;
    erasedRef.current = false;
    if (d?.mode === "draw" && liveStroke.current) {
      const s = liveStroke.current;
      liveStroke.current = null;
      if (s.points.length > 3) {
        setPast((p) => [...p.slice(-49), snap()]);
        setFuture([]);
        setStrokes((prev) => [...prev, s]);
      }
      setLiveVersion((v) => v + 1);
    }
  }

  /* ---------- generate from evidence ---------- */
  const generate = useCallback(() => {
    const scored = bundle.entities
      .map((e) => ({ e, score: e.artifactIds.length + bundle.links.filter((l) => l.from === e.id || l.to === e.id).length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 22);
    const cx = 520;
    const cy = 360;
    const newNodes: CanvasNode[] = scored.map(({ e }, i) => {
      const ang = (i / scored.length) * Math.PI * 2;
      const r = 120 + (i % 3) * 110;
      return {
        id: rid("CN"),
        kind: "entity",
        entityId: e.id,
        entityKind: e.kind,
        label: e.label,
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        evidenceIds: e.artifactIds.slice(0, 40),
        investigator,
        ts: Date.now(),
      };
    });
    const byEntity = new Map(newNodes.map((n) => [n.entityId, n]));
    const newEdges: CanvasEdge[] = [];
    for (const l of bundle.links) {
      const a = byEntity.get(l.from);
      const b = byEntity.get(l.to);
      if (!a || !b) continue;
      newEdges.push({
        id: rid("CE"),
        from: a.id,
        to: b.id,
        kind: "EVIDENCE",
        label: l.type,
        linkId: l.id,
        evidenceIds: l.evidenceIds,
        source: l.method,
        ts: bundle.artifacts.find((x) => x.id === l.evidenceIds[0])?.ts ?? null,
        confidence: l.confidence,
        investigator,
        createdAt: Date.now(),
      });
      if (newEdges.length >= 60) break;
    }
    for (const c of bundle.contradictions.slice(0, 12)) {
      const a = newNodes.find((n) => n.evidenceIds.includes(c.sideA.evidenceId));
      const b = newNodes.find((n) => n.evidenceIds.includes(c.sideB.evidenceId));
      if (a && b && a.id !== b.id)
        newEdges.push({
          id: rid("CE"),
          from: a.id,
          to: b.id,
          kind: "CONTRADICTION",
          label: c.kind,
          linkId: null,
          evidenceIds: [c.sideA.evidenceId, c.sideB.evidenceId],
          source: c.summary,
          ts: c.sideA.ts,
          confidence: null,
          investigator,
          createdAt: Date.now(),
        });
    }
    if (!newNodes.length) {
      toast.error("No entities were extracted from this UFDR — nothing to map.");
      return;
    }
    commit({ nodes: newNodes, edges: newEdges, strokes: [] });
    setView({ x: 0, y: 0, z: 0.85 });
    toast.success(`Evidence map generated: ${newNodes.length} points, ${newEdges.length} evidence-backed connections`);
  }, [bundle, commit, investigator]);

  /* ---------- export ---------- */
  const rasterize = useCallback(async (): Promise<string | null> => {
    const el = svgRef.current;
    if (!el) return null;
    const clone = el.cloneNode(true) as SVGSVGElement;
    const rect = el.getBoundingClientRect();
    clone.setAttribute("width", String(Math.round(rect.width)));
    clone.setAttribute("height", String(Math.round(rect.height)));
    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = Math.round(rect.width * 2);
        c.height = Math.round(rect.height * 2);
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#05070a";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }, []);

  const currentMap = useCallback(
    (): CanvasMap => ({ ...map, name: name.trim() || "Untitled investigation map", nodes, edges, strokes, investigator, updatedAt: Date.now() }),
    [map, name, nodes, edges, strokes, investigator],
  );

  async function save() {
    const snapshot = await rasterize();
    onSave({ ...currentMap(), snapshot }, snapshot);
  }

  async function exportImage() {
    const dataUrl = await rasterize();
    if (!dataUrl) {
      toast.error("Canvas export failed in this browser");
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `NEXORA_${bundle.id}_investigation_map.png`;
    a.click();
    onExport(dataUrl);
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        if (sel.type === "node")
          commit({ nodes: nodes.filter((n) => n.id !== sel.id), edges: edges.filter((x) => x.from !== sel.id && x.to !== sel.id) });
        else commit({ edges: edges.filter((x) => x.id !== sel.id) });
        setSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, sel, nodes, edges, commit]);

  const selectedNode = sel?.type === "node" ? nodes.find((n) => n.id === sel.id) : undefined;
  const selectedEdge = sel?.type === "edge" ? edges.find((n) => n.id === sel.id) : undefined;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const path = (s: CanvasStroke) => {
    let d = "";
    for (let i = 0; i < s.points.length; i += 2) d += `${i === 0 ? "M" : "L"}${s.points[i]},${s.points[i + 1]}`;
    return d;
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[220px_1fr_260px]">
      {/* palette */}
      <div className="glass flex max-h-[70vh] flex-col rounded-lg p-3">
        <p className="mono-xs text-muted-foreground uppercase">Evidence points</p>
        <div className="mt-2 flex items-center gap-1 rounded border border-input bg-input/40 px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities"
            className="w-full bg-transparent py-1.5 text-xs outline-none"
          />
        </div>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
          {palette.map((e) => (
            <button
              key={e.id}
              draggable
              onDragStart={(ev) => ev.dataTransfer.setData("text/nexora-entity", e.id)}
              onClick={() => addEntityNode(e.id)}
              className="mono-xs w-full truncate rounded border border-border/60 bg-secondary/40 px-2 py-1 text-left hover:border-primary/60 hover:text-primary"
              title={`${e.kind} · ${e.artifactIds.length} artifact(s)`}
            >
              <span className="text-primary">{e.kind}</span> {e.label}
            </button>
          ))}
          {!palette.length && <p className="mono-xs text-muted-foreground">No entity matches this search.</p>}
        </div>
      </div>

      {/* canvas */}
      <div>
        <div className="glass mb-2 flex flex-wrap items-center gap-1 rounded-lg p-2">
          {TOOLS.map(({ id, label, icon: Icon, hint }) => (
            <button
              key={id}
              onClick={() => {
                setTool(id);
                setConnectFrom(null);
              }}
              title={`${label} — ${hint}`}
              className={cn(
                "flex items-center gap-1 rounded border px-2 py-1 text-xs",
                tool === id ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button onClick={undo} disabled={!past.length} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button onClick={redo} disabled={!future.length} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40">
            <Redo2 className="h-3.5 w-3.5" /> Redo
          </button>
          <span className="mono-xs ml-auto text-muted-foreground">zoom {(view.z * 100).toFixed(0)}%</span>
        </div>

        <svg
          ref={svgRef}
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
          onPointerLeave={onSurfacePointerUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/nexora-entity");
            if (id) addEntityNode(id, toWorld(e.clientX, e.clientY));
          }}
          className="h-[70vh] w-full touch-none rounded-lg border border-border/70"
          style={{ background: "#05070a", cursor: tool === "select" ? "default" : "crosshair" }}
        >
          <defs>
            <pattern id="cgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#0f2a22" strokeWidth="1" />
            </pattern>
            {(["EVIDENCE", "HYPOTHESIS", "CONTRADICTION"] as CanvasEdgeKind[]).map((k) => (
              <marker key={k} id={`arw-${k}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6 Z" fill={EDGE_COLOR[k]} />
              </marker>
            ))}
          </defs>
          <rect x={0} y={0} width="100%" height="100%" fill="url(#cgrid)" opacity={0.5} />
          <g transform={`translate(${view.x},${view.y}) scale(${view.z})`}>
            {nodes
              .filter((n) => n.kind === "group")
              .map((n) => (
                <g key={n.id} onPointerDown={(e) => onNodePointerDown(e, n)}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.w ?? 320}
                    height={n.h ?? 220}
                    rx={10}
                    fill="#0b1f19"
                    fillOpacity={0.5}
                    stroke={sel?.id === n.id ? "#22c55e" : "#1f4d3d"}
                    strokeDasharray="6 4"
                  />
                  <text x={n.x + 10} y={n.y + 18} fill="#7dd3a8" fontSize={11} fontFamily="monospace">
                    GROUP · {n.label}
                  </text>
                </g>
              ))}

            {strokes.map((s) => (
              <path
                key={s.id}
                d={path(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeOpacity={STROKE_STYLE[s.tool].opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {liveStroke.current && (
              <path
                key={`live-${liveVersion}`}
                d={path(liveStroke.current)}
                fill="none"
                stroke={liveStroke.current.color}
                strokeWidth={liveStroke.current.width}
                strokeOpacity={STROKE_STYLE[liveStroke.current.tool].opacity}
                strokeLinecap="round"
              />
            )}

            {edges.map((e) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              return (
                <g key={e.id} onPointerDown={(ev) => { ev.stopPropagation(); setSel({ type: "edge", id: e.id }); }}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={EDGE_COLOR[e.kind]}
                    strokeWidth={sel?.id === e.id ? 3.5 : 2}
                    strokeDasharray={e.kind === "HYPOTHESIS" ? "7 5" : undefined}
                    markerEnd={`url(#arw-${e.kind})`}
                    opacity={0.9}
                  />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 5}
                    fill={EDGE_COLOR[e.kind]}
                    fontSize={9}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {e.kind === "HYPOTHESIS" ? "HYPOTHESIS" : e.label}
                  </text>
                </g>
              );
            })}

            {nodes
              .filter((n) => n.kind !== "group")
              .map((n) => {
                const active = sel?.id === n.id || connectFrom === n.id;
                if (n.kind === "sticky")
                  return (
                    <g key={n.id} onPointerDown={(e) => onNodePointerDown(e, n)} style={{ cursor: "move" }}>
                      <rect x={n.x} y={n.y} width={150} height={90} rx={4} fill="#3b3410" stroke={active ? "#facc15" : "#8a7615"} />
                      <foreignObject x={n.x + 6} y={n.y + 6} width={138} height={78}>
                        <div
                          style={{ font: "10px monospace", color: "#fde68a", overflow: "hidden", wordBreak: "break-word" }}
                        >
                          {n.label}
                        </div>
                      </foreignObject>
                    </g>
                  );
                if (n.kind === "text")
                  return (
                    <text
                      key={n.id}
                      x={n.x}
                      y={n.y}
                      fill={active ? "#22c55e" : "#d1fae5"}
                      fontSize={13}
                      fontFamily="monospace"
                      onPointerDown={(e) => onNodePointerDown(e, n)}
                      style={{ cursor: "move" }}
                    >
                      {n.label}
                    </text>
                  );
                return (
                  <g key={n.id} onPointerDown={(e) => onNodePointerDown(e, n)} style={{ cursor: "move" }}>
                    <circle r={9} cx={n.x} cy={n.y} fill={active ? "#22c55e" : "#0f3a2c"} stroke="#34d399" strokeWidth={1.5} />
                    <text x={n.x + 14} y={n.y + 4} fill="#e6fff5" fontSize={11} fontFamily="monospace">
                      {n.label.slice(0, 28)}
                    </text>
                    <text x={n.x + 14} y={n.y + 16} fill="#4ade80" fontSize={8} fontFamily="monospace">
                      {n.entityKind} · {n.evidenceIds.length} artifact(s)
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>

        <div className="mono-xs mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: EDGE_COLOR.EVIDENCE }} /> GREEN = evidence-backed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: EDGE_COLOR.HYPOTHESIS }} /> YELLOW = investigator hypothesis (not evidence)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: EDGE_COLOR.CONTRADICTION }} /> RED = contradiction</span>
          {tool === "connect" && <span className="text-primary">{connectFrom ? "Select the second point…" : "Select the first point…"}</span>}
        </div>
      </div>

      {/* inspector */}
      <div className="space-y-3">
        <div className="glass rounded-lg p-3">
          <p className="mono-xs text-muted-foreground uppercase">Map</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded border border-input bg-input/40 px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="mt-2 grid gap-1">
            <button onClick={generate} className="glow rounded bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground">
              Generate canvas from evidence
            </button>
            <button onClick={() => void save()} className="rounded border border-primary/50 px-2 py-1.5 text-xs text-primary">
              Save canvas
            </button>
            <button onClick={() => void exportImage()} className="rounded border border-border px-2 py-1.5 text-xs">
              Export canvas image
            </button>
            <button
              onClick={() => {
                if (!window.confirm("Clear all points and annotations on this canvas? Original evidence is unaffected.")) return;
                commit({ nodes: [], edges: [], strokes: [] });
              }}
              className="rounded border border-destructive/50 px-2 py-1.5 text-xs text-destructive"
            >
              Clear canvas
            </button>
          </div>
          <p className="mono-xs mt-2 text-muted-foreground">
            {nodes.length} point(s) · {edges.length} connection(s) · {strokes.length} annotation(s)
          </p>
        </div>

        <div className="glass rounded-lg p-3">
          <p className="mono-xs text-muted-foreground uppercase">Inspector</p>
          {!selectedNode && !selectedEdge && (
            <p className="mono-xs mt-2 text-muted-foreground">
              Select a point or connection. Annotations never alter the original evidence — they are investigator overlays only.
            </p>
          )}
          {selectedNode && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-semibold text-primary">{selectedNode.label}</p>
              <p className="mono-xs text-muted-foreground">
                {selectedNode.kind}{selectedNode.entityKind ? ` · ${selectedNode.entityKind}` : ""} · {selectedNode.investigator} · {fmt(selectedNode.ts)}
              </p>
              {selectedNode.evidenceIds.length > 0 && (
                <>
                  <p className="mono-xs text-cyber-dim">EVIDENCE: {selectedNode.evidenceIds.slice(0, 12).join(", ")}</p>
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {bundle.artifacts
                      .filter((a) => selectedNode.evidenceIds.includes(a.id))
                      .slice(0, 8)
                      .map((a) => (
                        <div key={a.id} className="rounded border border-border/60 bg-secondary/30 p-1.5">
                          <p className="mono-xs text-primary">{a.id} · {a.type}</p>
                          <p className="mono-xs text-muted-foreground">{fmt(a.ts)}</p>
                          <p className="mt-1 break-words">{a.text.slice(0, 180)}</p>
                        </div>
                      ))}
                  </div>
                </>
              )}
              <button
                onClick={() =>
                  commit({
                    nodes: nodes.filter((n) => n.id !== selectedNode.id),
                    edges: edges.filter((e) => e.from !== selectedNode.id && e.to !== selectedNode.id),
                  })
                }
                className="mono-xs mt-1 rounded border border-destructive/50 px-2 py-1 text-destructive"
              >
                REMOVE POINT
              </button>
            </div>
          )}
          {selectedEdge && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-semibold" style={{ color: EDGE_COLOR[selectedEdge.kind] }}>
                {selectedEdge.kind === "EVIDENCE"
                  ? "EVIDENCE-BACKED RELATIONSHIP"
                  : selectedEdge.kind === "CONTRADICTION"
                    ? "CONTRADICTION"
                    : "INVESTIGATOR HYPOTHESIS — NOT CONFIRMED EVIDENCE"}
              </p>
              <p>{nodeById.get(selectedEdge.from)?.label} → {nodeById.get(selectedEdge.to)?.label}</p>
              <p className="mono-xs text-muted-foreground">type {selectedEdge.label}</p>
              {selectedEdge.kind === "EVIDENCE" ? (
                <>
                  <p className="mono-xs text-cyber-dim">EVIDENCE IDS: {selectedEdge.evidenceIds.join(", ") || "none"}</p>
                  <p className="mono-xs text-muted-foreground">source/method: {selectedEdge.source ?? "not recorded"}</p>
                  <p className="mono-xs text-muted-foreground">timestamp: {fmt(selectedEdge.ts)}</p>
                  <p className="mono-xs text-muted-foreground">
                    confidence: {selectedEdge.confidence !== null ? `${(selectedEdge.confidence * 100).toFixed(0)}%` : "DATA INSUFFICIENT"}
                  </p>
                </>
              ) : (
                <p className="mono-xs text-warn">
                  Investigator-created connection by {selectedEdge.investigator}. No evidence ID supports it; it must never be reported as fact.
                </p>
              )}
              <button
                onClick={() => {
                  commit({ edges: edges.filter((e) => e.id !== selectedEdge.id) });
                  setSel(null);
                }}
                className="mono-xs mt-1 rounded border border-destructive/50 px-2 py-1 text-destructive"
              >
                REMOVE CONNECTION
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
