import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { search } from "@/lib/nexora/retrieval";
import { useNexora } from "@/lib/nexora/store";
import { ARTIFACT_LABELS } from "@/lib/nexora/types";

export const Route = createFileRoute("/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence Explorer — NEXORA" },
      { name: "description", content: "Hybrid local search across every normalized UFDR artifact with full raw-record inspection." },
      { property: "og:title", content: "Evidence Explorer — NEXORA" },
      { property: "og:description", content: "Search and inspect normalized UFDR artifacts offline." },
    ],
  }),
  component: EvidencePage,
});

function EvidencePage() {
  const { bundle, toggleBookmark, logActivity } = useNexora();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!bundle) return [];
    let list = bundle.artifacts;
    if (q.trim()) {
      const hits = search(bundle.index, q, 200);
      const rank = new Map(hits.map((h, i) => [h.artifactId, i]));
      list = list.filter((a) => rank.has(a.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    if (type !== "all") list = list.filter((a) => a.type === type);
    return list.slice(0, 300);
  }, [bundle, q, type]);

  if (!bundle) return <NoCase />;
  const types = [...new Set(bundle.artifacts.map((a) => a.type))];

  return (
    <div>
      <PageHead title="Evidence Explorer" description="Local hybrid retrieval (BM25 + offline embeddings). Every row is a parsed artifact with a stable evidence ID." />
      <Panel>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search evidence text, numbers, VPAs, places…"
            className="min-w-60 flex-1 rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-input bg-input/40 px-3 py-2 text-sm"
          >
            <option value="all">All types ({bundle.artifacts.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {ARTIFACT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <p className="mono-xs mt-2 text-muted-foreground">{rows.length} artifact(s) shown</p>
      </Panel>

      <div className="mt-4 space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="glass rounded-lg p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-xs text-primary">{a.id}</span>
              <Tag>{ARTIFACT_LABELS[a.type]}</Tag>
              {a.deleted && <Tag tone="warn">DELETED / RECOVERED</Tag>}
              <span className="mono-xs text-muted-foreground">{fmt(a.ts)}</span>
              <span className="mono-xs text-cyber-dim">{a.source}</span>
              <button
                onClick={() => void toggleBookmark(a.id)}
                className={`mono-xs ml-auto rounded border px-2 py-0.5 ${(bundle.bookmarks ?? []).includes(a.id) ? "border-primary/60 bg-primary/10 text-primary" : "border-border hover:text-primary"}`}
              >
                {(bundle.bookmarks ?? []).includes(a.id) ? "BOOKMARKED" : "BOOKMARK"}
              </button>
              <button
                onClick={() => {
                  const next = open === a.id ? null : a.id;
                  setOpen(next);
                  if (next) void logActivity("EVIDENCE_VIEWED", `Raw artifact inspected: ${a.id} (${a.type})`, [a.id]);
                }}
                className="mono-xs rounded border border-border px-2 py-0.5 hover:text-primary"
              >
                {open === a.id ? "HIDE RAW" : "VIEW RAW"}
              </button>
            </div>
            <p className="mt-2 text-sm break-words">{a.text.slice(0, 400)}</p>
            <p className="mono-xs mt-1 text-muted-foreground">
              {a.parties.length ? `parties: ${a.parties.join(", ")}` : "no parties recorded"}
              {a.lat !== null ? ` · gps ${a.lat.toFixed(4)},${a.lon?.toFixed(4)}` : ""}
              {a.app ? ` · app ${a.app}` : ""}
            </p>
            {open === a.id && (
              <pre className="mono-xs mt-2 max-h-64 overflow-auto rounded border border-border/60 bg-secondary/30 p-2 whitespace-pre-wrap">
                {JSON.stringify(a.raw, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {!rows.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">
              No artifact in the available extraction matches this query. That is not evidence that the activity did not occur.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
