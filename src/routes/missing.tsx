import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/missing")({
  head: () => ({
    meta: [
      { title: "Missing Evidence — NEXORA" },
      { name: "description", content: "Explicit coverage report of available vs absent artifact categories." },
      { property: "og:title", content: "Missing Evidence — NEXORA" },
      { property: "og:description", content: "Explicit coverage report of available vs absent artifact categories." },
    ],
  }),
  component: MissingPage,
});

function MissingPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  return (
    <div>
      <PageHead title="Missing Evidence Report" description="Absence of data is reported explicitly. Absence of evidence is never treated as evidence of absence." />
      <Panel>
        <table className="w-full text-left text-sm">
          <thead className="mono-xs text-muted-foreground">
            <tr><th className="py-1 pr-3">CATEGORY</th><th className="py-1 pr-3">RECORDS</th><th className="py-1 pr-3">STATUS</th><th className="py-1 pr-3">SOURCES</th></tr>
          </thead>
          <tbody>
            {bundle.coverage.map((c) => (
              <tr key={c.type} className="border-t border-border/50">
                <td className="py-1.5 pr-3">{c.type}</td>
                <td className="mono-xs py-1.5 pr-3">{c.count}</td>
                <td className="py-1.5 pr-3"><Tag tone={c.status === "AVAILABLE" ? "ok" : "warn"}>{c.status}</Tag></td>
                <td className="mono-xs py-1.5 pr-3 text-muted-foreground">{c.sources.join(", ") || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
