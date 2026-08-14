import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel } from "@/components/nexora/Bits";
import { GraphView } from "@/components/nexora/GraphView";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Knowledge Graph — NEXORA" },
      { name: "description", content: "Interactive entity-relationship graph built from evidence-backed links." },
      { property: "og:title", content: "Knowledge Graph — NEXORA" },
      { property: "og:description", content: "Interactive entity-relationship graph built from evidence-backed links." },
    ],
  }),
  component: GraphPage,
});

function GraphPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  return (
    <div>
      <PageHead title="Knowledge Graph" description="Nodes and edges are derived only from parsed artifacts. Edge styling reflects confidence class." />
      <Panel>
        <GraphView entities={bundle.entities} links={bundle.links} />
      </Panel>
    </div>
  );
}
