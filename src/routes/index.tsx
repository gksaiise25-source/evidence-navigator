import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AvailabilityPill, NoCase, PageHead, Panel, Stat, StatusPill, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";
import { ARTIFACT_LABELS, type LinkStatus } from "@/lib/nexora/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXORA Dashboard — Live Case Overview" },
      {
        name: "description",
        content:
          "Real-time overview of the loaded UFDR case: artifact counts, entity links, anomalies and evidence coverage, computed locally.",
      },
      { property: "og:title", content: "NEXORA Dashboard — Live Case Overview" },
      {
        property: "og:description",
        content: "Artifact counts, entity links, anomalies and evidence coverage for the loaded UFDR case.",
      },
    ],
  }),
  component: Dashboard,
});

const STATUSES: LinkStatus[] = ["CONFIRMED", "PROBABLE", "POSSIBLE", "UNVERIFIED"];

function Dashboard() {
  const { bundle } = useNexora();

  const stats = useMemo(() => {
    if (!bundle) return null;
    const byType = new Map<string, number>();
    for (const a of bundle.artifacts) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
    const timed = bundle.artifacts.filter((a) => a.ts !== null).map((a) => a.ts as number);
    return {
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      first: timed.length ? Math.min(...timed) : null,
      last: timed.length ? Math.max(...timed) : null,
      geo: bundle.artifacts.filter((a) => a.lat !== null).length,
      deleted: bundle.artifacts.filter((a) => a.deleted).length,
    };
  }, [bundle]);

  if (!bundle || !stats) return <NoCase />;

  const unresolved = bundle.links.filter(
    (l) => (l.status === "POSSIBLE" || l.status === "UNVERIFIED") && !bundle.verdicts[l.id],
  );

  return (
    <div>
      <PageHead
        title="Forensic Dashboard"
        description={`Every figure below is computed from ${bundle.zipName} on this machine. No values are estimated or pre-seeded.`}
      >
        <Link to="/ai" className="glow rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Open AI Investigation
        </Link>
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Artifacts parsed" value={bundle.artifacts.length} hint={`${bundle.files.length} files ingested`} />
        <Stat label="Entities" value={bundle.entities.length} hint={`${bundle.links.length} evidence-backed links`} />
        <Stat label="Payment artifacts" value={bundle.payments.length} hint={`${bundle.bankCorrelations.length} bank correlations`} />
        <Stat label="Investigative leads" value={bundle.anomalies.length} hint={`${bundle.contradictions.length} contradictions`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Artifact composition" subtitle="Counts from parsed rows" className="xl:col-span-2">
          <div className="space-y-2">
            {stats.byType.map(([type, count]) => {
              const pct = Math.round((count / bundle.artifacts.length) * 100);
              return (
                <div key={type}>
                  <div className="mono-xs flex justify-between">
                    <span>{ARTIFACT_LABELS[type as keyof typeof ARTIFACT_LABELS] ?? type}</span>
                    <span className="text-muted-foreground">
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-secondary/70">
                    <div className="h-full rounded bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Case integrity" subtitle="Local hashes and window">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="mono-xs text-muted-foreground">CASE ID</dt>
              <dd className="mono-xs break-all">{bundle.id}</dd>
            </div>
            <div>
              <dt className="mono-xs text-muted-foreground">UFDR SHA-256</dt>
              <dd className="mono-xs break-all text-primary">{bundle.zipSha256}</dd>
            </div>
            <div>
              <dt className="mono-xs text-muted-foreground">EVIDENCE WINDOW</dt>
              <dd className="mono-xs">
                {fmt(stats.first)} → {fmt(stats.last)}
              </dd>
            </div>
            <div>
              <dt className="mono-xs text-muted-foreground">GEOLOCATED / DELETED</dt>
              <dd className="mono-xs">
                {stats.geo} geolocated · {stats.deleted} deleted-flagged
              </dd>
            </div>
            <div>
              <dt className="mono-xs text-muted-foreground">GROUND TRUTH FILE</dt>
              <dd className="mono-xs">
                {bundle.groundTruthFile ? (
                  <Tag tone="warn">{bundle.groundTruthFile} — evaluation only, excluded from evidence</Tag>
                ) : (
                  "none present"
                )}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Link confidence distribution" subtitle="Classification of cross-modal links">
          <div className="space-y-2">
            {STATUSES.map((s) => {
              const n = bundle.links.filter((l) => l.status === s).length;
              return (
                <div key={s} className="flex items-center justify-between gap-2">
                  <StatusPill status={s} />
                  <span className="mono-xs text-muted-foreground">{n}</span>
                </div>
              );
            })}
            <p className="mono-xs pt-2 text-muted-foreground">
              {unresolved.length} link(s) await human verification.{" "}
              <Link to="/graph" className="text-primary underline">
                Review
              </Link>
            </p>
          </div>
        </Panel>

        <Panel title="Latest investigative leads" subtitle="Anomaly signals — never conclusions" className="xl:col-span-2">
          {bundle.anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No anomaly signal was produced from the available extraction.
            </p>
          ) : (
            <ul className="space-y-2">
              {bundle.anomalies.slice(0, 6).map((a) => (
                <li key={a.id} className="rounded border border-border/60 bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone="warn">INVESTIGATIVE LEAD</Tag>
                    <span className="text-sm font-medium">{a.label}</span>
                    <span className="mono-xs text-muted-foreground">{fmt(a.ts)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                  <p className="mono-xs mt-1 text-cyber-dim">{a.evidenceIds.join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Evidence coverage" subtitle="Availability of each artifact category">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {bundle.coverage.map((c) => (
            <div key={c.type} className="flex items-start justify-between gap-2 rounded border border-border/60 p-2">
              <div>
                <p className="text-sm">{ARTIFACT_LABELS[c.type]}</p>
                <p className="mono-xs text-muted-foreground">{c.count} records</p>
              </div>
              <AvailabilityPill status={c.status} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
