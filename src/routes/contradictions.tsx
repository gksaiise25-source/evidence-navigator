import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/contradictions")({
  head: () => ({
    meta: [
      { title: "Contradiction Analysis — NEXORA" },
      { name: "description", content: "Conflicts detected between independent evidence sources." },
      { property: "og:title", content: "Contradiction Analysis — NEXORA" },
      { property: "og:description", content: "Conflicts detected between independent evidence sources." },
    ],
  }),
  component: ContradictionsPage,
});

function ContradictionsPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  return (
    <div>
      <PageHead title="Contradiction Analysis" description="Each conflict names both sides of the evidence. NEXORA reports the conflict and never silently picks a winner." />
      {bundle.contradictions.length === 0 ? (
        <Panel><p className="text-sm text-muted-foreground">No contradiction was detected between the available evidence sources.</p></Panel>
      ) : (
        <div className="space-y-3">
          {bundle.contradictions.map((c) => (
            <Panel key={c.id} title={c.summary} subtitle={c.kind}>
              
              <div className="mono-xs mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-border/60 p-2"><p className="text-muted-foreground">SIDE A</p><p>{c.sideA.label} · {c.sideA.detail} · {c.sideA.evidenceId}</p></div>
                <div className="rounded border border-border/60 p-2"><p className="text-muted-foreground">SIDE B</p><p>{c.sideB.label} · {c.sideB.detail} · {c.sideB.evidenceId}</p></div>
              </div>
              <p className="mono-xs mt-2 text-cyber-dim">{[c.sideA.evidenceId, c.sideB.evidenceId].join(", ")}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
