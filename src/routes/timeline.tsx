import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Evidence Timeline — NEXORA" },
      { name: "description", content: "Chronological reconstruction of all timestamped artifacts with anomaly markers." },
      { property: "og:title", content: "Evidence Timeline — NEXORA" },
      { property: "og:description", content: "Chronological reconstruction of all timestamped artifacts with anomaly markers." },
    ],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  const items = bundle.artifacts
    .filter((a) => a.ts !== null)
    .slice()
    .sort((a, b) => (a.ts as number) - (b.ts as number));
  const flagged = new Set(bundle.anomalies.flatMap((a) => a.evidenceIds));
  return (
    <div>
      <PageHead title="Evidence Timeline" description={`${items.length} of ${bundle.artifacts.length} artifacts carry a usable timestamp. Untimed artifacts are excluded rather than estimated.`} />
      <Panel>
        <ol className="space-y-2">
          {items.slice(0, 400).map((a) => (
            <li key={a.id} className="border-l-2 border-primary/40 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono-xs text-primary">{fmt(a.ts)}</span>
                <Tag>{a.type}</Tag>
                {flagged.has(a.id) && <Tag tone="warn">LEAD</Tag>}
                <span className="mono-xs text-muted-foreground">{a.id}</span>
              </div>
              <p className="text-sm">{a.text.slice(0, 220)}</p>
            </li>
          ))}
        </ol>
        {!items.length && <p className="text-sm text-muted-foreground">DATA INSUFFICIENT — no timestamped artifact available.</p>}
      </Panel>
    </div>
  );
}
