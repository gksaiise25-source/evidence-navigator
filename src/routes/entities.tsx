import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NoCase, PageHead, Panel, StatusPill, Tag } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/entities")({
  head: () => ({
    meta: [
      { title: "Entities & Links — NEXORA" },
      { name: "description", content: "Resolved entities and their evidence-backed cross-modal links with confidence classification." },
      { property: "og:title", content: "Entities & Links — NEXORA" },
      { property: "og:description", content: "Resolved entities and evidence-backed links." },
    ],
  }),
  component: EntitiesPage,
});

function EntitiesPage() {
  const { bundle } = useNexora();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!bundle) return [];
    return bundle.entities.filter(
      (e) => (kind === "all" || e.kind === kind) && (!q.trim() || e.label.toLowerCase().includes(q.toLowerCase())),
    );
  }, [bundle, kind, q]);

  if (!bundle) return <NoCase />;
  const kinds = [...new Set(bundle.entities.map((e) => e.kind))];
  const selected = bundle.entities.find((e) => e.id === sel) ?? null;
  const selLinks = selected ? bundle.links.filter((l) => l.a === selected.id || l.b === selected.id) : [];

  return (
    <div>
      <PageHead title="Entities & Links" description="Entities exist only because an artifact contained them. Links carry a confidence class and the evidence that produced them." />
      <Panel>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter entities…" className="min-w-56 flex-1 rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border border-input bg-input/40 px-3 py-2 text-sm">
            <option value="all">All kinds ({bundle.entities.length})</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title={`Entities (${list.length})`} className="xl:col-span-2">
          <ul className="space-y-1.5">
            {list.map((e) => (
              <li key={e.id}>
                <button onClick={() => setSel(e.id)} className={`w-full rounded border p-2 text-left ${sel === e.id ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{e.kind}</Tag>
                    <span className="text-sm">{e.label}</span>
                    <span className="mono-xs ml-auto text-muted-foreground">{e.artifactIds.length} artifacts</span>
                  </div>
                </button>
              </li>
            ))}
            {!list.length && <p className="text-sm text-muted-foreground">No entity matches this filter.</p>}
          </ul>
        </Panel>

        <Panel title="Link detail" subtitle={selected ? selected.label : "Select an entity"}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an entity to inspect its links and supporting evidence.</p>
          ) : (
            <div className="space-y-2">
              <p className="mono-xs text-muted-foreground">{selected.id}</p>
              {selLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cross-modal link is supported by the available evidence.</p>
              ) : (
                selLinks.map((l) => {
                  const other = bundle.entities.find((x) => x.id === (l.a === selected.id ? l.b : l.a));
                  const verdict = bundle.verdicts[l.id];
                  return (
                    <div key={l.id} className="rounded border border-border/60 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={l.status} />
                        <span className="text-sm">{other?.label ?? "unknown"}</span>
                      </div>
                      <p className="mono-xs mt-1 text-muted-foreground">{l.reason}</p>
                      <p className="mono-xs mt-1 text-cyber-dim">{l.evidenceIds.slice(0, 6).join(", ")}</p>
                      {verdict && <p className="mono-xs mt-1 text-primary">HUMAN VERDICT: {verdict.verdict}</p>}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
