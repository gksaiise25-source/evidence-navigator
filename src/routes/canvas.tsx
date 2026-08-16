import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { CanvasBoard } from "@/components/nexora/CanvasBoard";
import { useNexora } from "@/lib/nexora/store";
import type { CanvasMap } from "@/lib/nexora/types";

export const Route = createFileRoute("/canvas")({
  head: () => ({
    meta: [
      { title: "Investigation Canvas — NEXORA" },
      {
        name: "description",
        content: "Investigator-controlled evidence map: drag entity points, connect relationships, sketch and annotate without altering evidence.",
      },
      { property: "og:title", content: "Investigation Canvas — NEXORA" },
      { property: "og:description", content: "Draw, connect and annotate an evidence map that never mutates original artifacts." },
    ],
  }),
  component: CanvasPage,
});

function emptyMap(caseId: string, investigator: string, n: number): CanvasMap {
  const now = Date.now();
  return {
    id: `MAP-${now.toString(36)}`,
    caseId,
    name: `Investigation map ${n}`,
    investigator,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    strokes: [],
    snapshot: null,
  };
}

function CanvasPage() {
  const { bundle, investigator, saveCanvas, deleteCanvas, setReportCanvas, logActivity } = useNexora();
  const maps = useMemo(() => bundle?.canvases ?? [], [bundle]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasMap | null>(null);

  if (!bundle) return <NoCase />;

  const active =
    maps.find((m) => m.id === activeId) ?? draft ?? maps[0] ?? emptyMap(bundle.id, investigator, maps.length + 1);

  return (
    <div>
      <PageHead
        title="Investigation Canvas"
        description="Investigator-controlled map. Points, connections, sketches and notes are stored as annotations with your ID, the timestamp, the case ID and any linked evidence IDs — original evidence stays immutable."
      >
        <button
          onClick={() => {
            const m = emptyMap(bundle.id, investigator, maps.length + 1);
            setDraft(m);
            setActiveId(m.id);
          }}
          className="rounded border border-primary/50 px-3 py-2 text-sm text-primary"
        >
          New map
        </button>
      </PageHead>

      <Panel className="mb-3" title="Saved investigation maps" subtitle="Multiple maps per case are supported. Attach one to the forensic report.">
        <div className="flex flex-wrap gap-2">
          {maps.map((m) => (
            <div key={m.id} className={`rounded border px-2 py-1.5 ${active.id === m.id ? "border-primary/60 bg-primary/10" : "border-border"}`}>
              <button onClick={() => setActiveId(m.id)} className="mono-xs block text-left hover:text-primary">
                {m.name} · {m.nodes.length}pts / {m.edges.length}conn
              </button>
              <p className="mono-xs text-muted-foreground">{m.investigator} · {fmt(m.updatedAt)}</p>
              <div className="mt-1 flex gap-1">
                {bundle.reportCanvasId === m.id ? (
                  <Tag tone="green">IN REPORT</Tag>
                ) : (
                  <button onClick={() => void setReportCanvas(m.id)} className="mono-xs rounded border border-border px-1 hover:text-primary">
                    ADD TO REPORT
                  </button>
                )}
                <button onClick={() => void deleteCanvas(m.id)} className="mono-xs rounded border border-destructive/50 px-1 text-destructive">
                  DELETE
                </button>
              </div>
            </div>
          ))}
          {!maps.length && <p className="mono-xs text-muted-foreground">No map saved yet — build one below and press “Save canvas”.</p>}
        </div>
      </Panel>

      <CanvasBoard
        key={active.id}
        bundle={bundle}
        investigator={investigator}
        map={active}
        onSave={(m) => {
          void saveCanvas(m);
          setDraft(null);
          setActiveId(m.id);
          toast.success("Investigation map saved to the local case file");
        }}
        onExport={() => {
          void logActivity("CANVAS_EXPORTED", `Investigation map "${active.name}" exported as PNG`);
          toast.success("Canvas image exported");
        }}
      />
    </div>
  );
}
