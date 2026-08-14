import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel } from "@/components/nexora/Bits";
import { generateReport } from "@/lib/nexora/report";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Forensic Report — NEXORA" },
      { name: "description", content: "Generate a court-ready PDF report of findings, links and verification records." },
      { property: "og:title", content: "Forensic Report — NEXORA" },
      { property: "og:description", content: "Generate a court-ready PDF report of findings, links and verification records." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  return (
    <div>
      <PageHead title="Forensic Report" description="The report contains only findings backed by evidence IDs, plus every recorded human verification.">
        <button onClick={() => generateReport(bundle)} className="glow rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Generate PDF
        </button>
      </PageHead>
      <Panel title="Report contents preview">
        <ul className="space-y-1 text-sm">
          <li>Case {bundle.name} · package {bundle.zipName}</li>
          <li className="mono-xs text-muted-foreground">SHA-256 {bundle.zipSha256}</li>
          <li>{bundle.artifacts.length} artifacts · {bundle.entities.length} entities · {bundle.links.length} links</li>
          <li>{bundle.anomalies.length} investigative leads · {bundle.contradictions.length} contradictions</li>
          <li>{Object.keys(bundle.verdicts).length} human verification record(s)</li>
          <li>{bundle.coverage.filter((c) => c.status !== "AVAILABLE").length} category/categories reported as not found</li>
        </ul>
      </Panel>
    </div>
  );
}
