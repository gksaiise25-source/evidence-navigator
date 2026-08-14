import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHead, Panel, Tag } from "@/components/nexora/Bits";
import { ingestUfdr, PIPELINE_STAGES } from "@/lib/nexora/pipeline";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "UFDR Import — NEXORA" },
      {
        name: "description",
        content: "Import a UFDR ZIP and run the local parsing, linking and indexing pipeline entirely offline.",
      },
      { property: "og:title", content: "UFDR Import — NEXORA" },
      { property: "og:description", content: "Offline UFDR ZIP ingestion with SHA-256 integrity hashing." },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const { saveCase, cases, selectCase, deleteCase, bundle } = useNexora();
  const [caseName, setCaseName] = useState("");
  const [investigator, setInvestigator] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setPct(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await ingestUfdr({
        bytes,
        zipName: file.name,
        caseName,
        investigator,
        onStage: (s, p) => {
          setStage(s);
          setPct(p);
        },
      });
      await saveCase(result);
      toast.success(`Ingested ${result.artifacts.length} artifacts from ${result.files.length} files`);
      setStage("Complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse UFDR package");
      setStage("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead
        title="UFDR Import"
        description="The ZIP is hashed and parsed in this browser only. No bytes are uploaded, logged or transmitted."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="New case" subtitle="Case isolation: each import is stored as its own local case" className="xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mono-xs text-muted-foreground">CASE NAME</span>
              <input
                value={caseName}
                onChange={(e) => setCaseName(e.target.value)}
                placeholder="e.g. OP-NIGHTFALL-2026-08"
                className="mt-1 w-full rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm">
              <span className="mono-xs text-muted-foreground">INVESTIGATOR</span>
              <input
                value={investigator}
                onChange={(e) => setInvestigator(e.target.value)}
                placeholder="Examiner name / ID"
                className="mt-1 w-full rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div
            className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void handleFile(f);
            }}
          >
            <p className="text-sm">Drop the UFDR ZIP here, or</p>
            <button
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="glow mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Processing locally…" : "Select UFDR ZIP"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <p className="mono-xs mt-3 text-muted-foreground">
              CSV / JSON artifacts inside the archive are parsed. Unsafe paths and unsupported formats are skipped.
            </p>
          </div>

          {(busy || stage) && (
            <div className="mt-4">
              <div className="mono-xs flex justify-between">
                <span className="text-primary">{stage}</span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-secondary/70">
                <div className="h-full rounded bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <ol className="mono-xs mt-3 grid gap-1 text-muted-foreground sm:grid-cols-2">
                {PIPELINE_STAGES.map((s) => (
                  <li key={s} className={s === stage ? "text-primary" : undefined}>
                    → {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Panel>

        <Panel title="Local cases" subtitle="Stored in this browser only (IndexedDB)">
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases stored yet.</p>
          ) : (
            <ul className="space-y-2">
              {cases.map((c) => (
                <li key={c.id} className="rounded border border-border/60 p-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="mono-xs text-muted-foreground">
                    {c.id} · {c.artifacts} artifacts · {c.entities} entities
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void selectCase(c.id)}
                      className="mono-xs rounded border border-primary/40 px-2 py-1 text-primary"
                    >
                      {bundle?.id === c.id ? "ACTIVE" : "OPEN"}
                    </button>
                    <button
                      onClick={() => void deleteCase(c.id)}
                      className="mono-xs rounded border border-destructive/40 px-2 py-1 text-destructive"
                    >
                      DELETE
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {bundle && (
        <Panel className="mt-4" title="Ingested files & integrity hashes" subtitle={`Package SHA-256 ${bundle.zipSha256}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mono-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">FILE</th>
                  <th className="py-1 pr-3">TYPE</th>
                  <th className="py-1 pr-3">ROWS</th>
                  <th className="py-1 pr-3">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {bundle.files.map((f) => (
                  <tr key={f.name} className="border-t border-border/50">
                    <td className="py-1.5 pr-3">
                      {f.name}
                      {bundle.groundTruthFile === f.name && (
                        <span className="ml-2">
                          <Tag tone="warn">EVALUATION ONLY</Tag>
                        </span>
                      )}
                    </td>
                    <td className="mono-xs py-1.5 pr-3">{f.type}</td>
                    <td className="mono-xs py-1.5 pr-3">{f.rows}</td>
                    <td className="mono-xs py-1.5 pr-3 break-all text-cyber-dim">{f.sha256}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
