import { useMemo, useState } from "react";
import { fmt } from "./Bits";
import type { Artifact } from "@/lib/nexora/types";

const W = 900;
const H = 520;
const PAD = 40;

export function MapView({
  points,
  onSelect,
}: {
  points: Artifact[];
  onSelect?: (a: Artifact) => void;
}) {
  const [hover, setHover] = useState<Artifact | null>(null);

  const projected = useMemo(() => {
    const valid = points.filter((p) => p.lat !== null && p.lon !== null);
    if (!valid.length) return { items: [], bbox: null as null | number[] };
    const lats = valid.map((p) => p.lat as number);
    const lons = valid.map((p) => p.lon as number);
    const minOf = (xs: number[]) => xs.reduce((m, v) => (v < m ? v : m), xs[0] as number);
    const maxOf = (xs: number[]) => xs.reduce((m, v) => (v > m ? v : m), xs[0] as number);
    const minLat = minOf(lats);
    const maxLat = maxOf(lats);
    const minLon = minOf(lons);
    const maxLon = maxOf(lons);
    const spanLat = maxLat - minLat || 0.01;
    const spanLon = maxLon - minLon || 0.01;
    const items = valid.map((p) => ({
      artifact: p,
      x: PAD + ((((p.lon as number) - minLon) / spanLon) * (W - PAD * 2)),
      y: H - PAD - ((((p.lat as number) - minLat) / spanLat) * (H - PAD * 2)),
    }));
    return { items, bbox: [minLat, maxLat, minLon, maxLon] };
  }, [points]);

  if (!projected.items.length) {
    return (
      <div className="rounded-md border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
        No geolocated artifact is available in this extraction, so no map can be rendered. Nothing
        about movement can be established from the available data.
      </div>
    );
  }

  const path = projected.items
    .slice()
    .sort((a, b) => (a.artifact.ts ?? 0) - (b.artifact.ts ?? 0))
    .map((i, idx) => `${idx === 0 ? "M" : "L"}${i.x.toFixed(1)},${i.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="grid-tech min-w-[680px] w-full rounded-md border border-border/60">
        <path d={path} fill="none" stroke="oklch(0.6 0.1 160)" strokeOpacity={0.5} strokeWidth={1.2} />
        {projected.items.map((i, idx) => (
          <g
            key={i.artifact.id}
            transform={`translate(${i.x},${i.y})`}
            onMouseEnter={() => setHover(i.artifact)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(i.artifact)}
            style={{ cursor: "pointer" }}
          >
            <circle r={9} fill="oklch(0.85 0.2 152)" fillOpacity={0.12} />
            <circle r={4} fill="oklch(0.85 0.2 152)" />
            <text x={7} y={-6} fontSize={8} fill="oklch(0.8 0.02 160)" style={{ fontFamily: "IBM Plex Mono" }}>
              {idx + 1}
            </text>
          </g>
        ))}
      </svg>
      {projected.bbox && (
        <p className="mono-xs mt-2 text-muted-foreground">
          BBOX lat {projected.bbox[0]?.toFixed(4)} → {projected.bbox[1]?.toFixed(4)} · lon{" "}
          {projected.bbox[2]?.toFixed(4)} → {projected.bbox[3]?.toFixed(4)} · {projected.items.length}{" "}
          geolocated artifacts · offline coordinate plot (no tile service contacted)
        </p>
      )}
      {hover && (
        <div className="glass mono-xs pointer-events-none absolute top-2 right-2 max-w-xs rounded p-3">
          <p className="text-primary">{hover.id}</p>
          <p className="mt-1">{fmt(hover.ts)}</p>
          <p className="mt-1 text-muted-foreground">
            {hover.lat?.toFixed(5)}, {hover.lon?.toFixed(5)} {hover.place ? `· ${hover.place}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">{hover.text.slice(0, 140)}</p>
        </div>
      )}
    </div>
  );
}
