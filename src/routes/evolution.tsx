import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/evolution")({
  head: () => ({
    meta: [
      { title: "Identity Evolution — NEXORA" },
      { name: "description", content: "Identifier history for each person: aliases, linked handles and first/last observed activity." },
      { property: "og:title", content: "Identity Evolution — NEXORA" },
      { property: "og:description", content: "Identifier history for each person: aliases, linked handles and first/last observed activity." },
    ],
  }),
  component: EvolutionPage,
});

function EvolutionPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  const persons = bundle.entities.filter((e) => e.kind === "person");
  return (
    <div>
      <PageHead title="Identity Evolution" description="Identifier history assembled strictly from observed artifacts." />
      <div className="space-y-3">
        {persons.length === 0 && (
          <Panel><p className="text-sm text-muted-foreground">No person entity was recovered from the available extraction.</p></Panel>
        )}
        {persons.map((p) => {
          const links = bundle.links.filter((l) => l.from === p.id || l.to === p.id);
          const times = p.artifactIds
            .map((id) => bundle.artifacts.find((a) => a.id === id)?.ts ?? null)
            .filter((t): t is number => t !== null);
          return (
            <Panel key={p.id} title={p.label} subtitle={`${links.length} linked identifier(s)`}>
              <p className="mono-xs text-muted-foreground">
                FIRST SEEN {times.length ? fmt(Math.min(...times)) : "unknown"} · LAST SEEN{" "}
                {times.length ? fmt(Math.max(...times)) : "unknown"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {links.map((l) => {
                  const other = bundle.entities.find((e) => e.id === (l.from === p.id ? l.to : l.from));
                  return <Tag key={l.id}>{other?.kind}: {other?.label} · {l.status}</Tag>;
                })}
                {!links.length && <p className="text-sm text-muted-foreground">DATA INSUFFICIENT — no identifier link supported by evidence.</p>}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
