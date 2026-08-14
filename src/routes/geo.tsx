import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel } from "@/components/nexora/Bits";
import { MapView } from "@/components/nexora/MapView";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/geo")({
  head: () => ({
    meta: [
      { title: "Geospatial Evidence — NEXORA" },
      { name: "description", content: "Offline plot of every geolocated artifact with movement ordering." },
      { property: "og:title", content: "Geospatial Evidence — NEXORA" },
      { property: "og:description", content: "Offline plot of every geolocated artifact with movement ordering." },
    ],
  }),
  component: GeoPage,
});

function GeoPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  const points = bundle.artifacts.filter((a) => a.lat !== null && a.lon !== null);
  return (
    <div>
      <PageHead title="Geospatial Evidence" description="Coordinates are plotted locally; no map tile service is contacted." />
      <Panel title={`${points.length} geolocated artifact(s)`}>
        <MapView points={points} />
      </Panel>
    </div>
  );
}
