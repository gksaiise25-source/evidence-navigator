import { useEffect, useMemo, useState } from "react";
import type { Entity, Link as GLink } from "@/lib/nexora/types";

interface Node {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  deg: number;
}

const KIND_COLOR: Record<string, string> = {
  person: "oklch(0.85 0.2 152)",
  phone: "oklch(0.75 0.12 220)",
  handle: "oklch(0.7 0.14 300)",
  upi: "oklch(0.82 0.16 85)",
  account: "oklch(0.8 0.14 60)",
  device: "oklch(0.72 0.09 190)",
  location: "oklch(0.68 0.16 25)",
  merchant: "oklch(0.8 0.13 40)",
  app: "oklch(0.65 0.06 160)",
  email: "oklch(0.72 0.1 260)",
  face: "oklch(0.86 0.12 130)",
  media: "oklch(0.6 0.05 168)",
};

const W = 900;
const H = 560;

export function GraphView({
  entities,
  links,
  selectedId,
  onSelect,
}: {
  entities: Entity[];
  links: GLink[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    const ids = new Set(entities.map((e) => e.id));
    const edges = links.filter((l) => ids.has(l.from) && ids.has(l.to));
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    return { edges, deg };
  }, [entities, links]);

  useEffect(() => {
    const initial: Node[] = entities.map((e, i) => {
      const angle = (i / Math.max(1, entities.length)) * Math.PI * 2;
      return {
        id: e.id,
        label: e.label,
        kind: e.kind,
        x: W / 2 + Math.cos(angle) * (140 + (i % 7) * 22),
        y: H / 2 + Math.sin(angle) * (120 + (i % 5) * 20),
        vx: 0,
        vy: 0,
        deg: model.deg.get(e.id) ?? 0,
      };
    });

    const pos = new Map(initial.map((n) => [n.id, n]));
    for (let iter = 0; iter < 220; iter++) {
      // repulsion
      for (let i = 0; i < initial.length; i++) {
        const a = initial[i];
        if (!a) continue;
        for (let j = i + 1; j < initial.length; j++) {
          const b = initial[j];
          if (!b) continue;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const f = 900 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
      }
      // attraction along edges
      for (const e of model.edges) {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 90) * 0.012 * (0.5 + e.confidence);
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of initial) {
        n.vx += (W / 2 - n.x) * 0.004;
        n.vy += (H / 2 - n.y) * 0.004;
        n.x = Math.max(24, Math.min(W - 24, n.x + n.vx * 0.5));
        n.y = Math.max(24, Math.min(H - 24, n.y + n.vy * 0.5));
        n.vx *= 0.82;
        n.vy *= 0.82;
      }
    }
    setNodes(initial.map((n) => ({ ...n })));
  }, [entities, model]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (!entities.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No entities to plot for the current filter. Nothing is generated without evidence.
      </p>
    );
  }

  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[680px] w-full">
        {model.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const active = selectedId && (e.from === selectedId || e.to === selectedId);
          return (
            <line
              key={e.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? "oklch(0.85 0.2 152)" : "oklch(0.6 0.06 165)"}
              strokeOpacity={active ? 0.85 : 0.22 + e.confidence * 0.25}
              strokeWidth={active ? 1.8 : 0.6 + e.confidence}
              strokeDasharray={e.status === "UNVERIFIED" || e.status === "POSSIBLE" ? "4 3" : undefined}
            />
          );
        })}
        {nodes.map((n) => {
          const r = 5 + Math.min(9, n.deg * 0.7);
          const isSel = selectedId === n.id;
          const color = KIND_COLOR[n.kind] ?? "oklch(0.7 0.05 168)";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => onSelect?.(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              <circle r={r + (isSel ? 5 : 0)} fill={color} fillOpacity={isSel ? 0.35 : 0.12} />
              <circle r={r} fill={color} fillOpacity={0.9} stroke="oklch(0.16 0.014 168)" strokeWidth={1} />
              {(hover === n.id || isSel || n.deg > 3) && (
                <text
                  x={r + 4}
                  y={3}
                  fontSize={9}
                  fill="oklch(0.93 0.017 160)"
                  style={{ fontFamily: "IBM Plex Mono, monospace" }}
                >
                  {n.label.slice(0, 26)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(KIND_COLOR).map(([kind, color]) => (
          <span key={kind} className="mono-xs flex items-center gap-1 text-muted-foreground">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
            {kind}
          </span>
        ))}
      </div>
    </div>
  );
}
