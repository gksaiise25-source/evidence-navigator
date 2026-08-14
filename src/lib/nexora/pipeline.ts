import { buildCoverage, detectAnomalies, detectContradictions } from "./analysis";
import { buildEntitiesAndLinks } from "./entities";
import { correlateBankDetails, extractPayments } from "./financial";
import { sha256 } from "./hash";
import { detectType, parseUfdrZip } from "./parse";
import { buildIndex } from "./retrieval";
import type { ArtifactType, CaseBundle } from "./types";

export const PIPELINE_STAGES = [
  "Hashing UFDR package (SHA-256)",
  "Safe ZIP extraction",
  "Parsing & normalization",
  "Artifact/entity extraction",
  "Cross-modal entity linking",
  "Knowledge graph construction",
  "Evidence index (local embeddings + hybrid retrieval)",
  "Timeline & anomaly detection",
  "Financial / UPI intelligence",
  "Contradiction & missing-evidence analysis",
] as const;

export async function ingestUfdr(input: {
  bytes: Uint8Array;
  zipName: string;
  caseName: string;
  investigator: string;
  onStage?: (stage: string, pct: number) => void;
}): Promise<CaseBundle> {
  const { bytes, zipName, caseName, investigator, onStage } = input;
  const step = (i: number) => onStage?.(PIPELINE_STAGES[i] ?? "", Math.round(((i + 1) / PIPELINE_STAGES.length) * 100));

  step(0);
  const zipSha256 = await sha256(bytes);

  step(1);
  const parsed = await parseUfdrZip(bytes);

  step(2);
  const artifacts = parsed.artifacts;

  step(3);
  const manifestTypes = new Set<ArtifactType>();
  for (const a of artifacts) {
    if (a.type !== "manifest") continue;
    for (const v of Object.values(a.raw)) {
      const t = detectType(v);
      if (t !== "unknown") manifestTypes.add(t);
    }
  }

  step(4);
  const { entities, links } = buildEntitiesAndLinks(artifacts);

  step(5);
  // graph is derived from entities + links at render time

  step(6);
  const index = buildIndex(artifacts);

  step(7);
  const anomalies = detectAnomalies(artifacts);

  step(8);
  const payments = extractPayments(artifacts);
  const bankCorrelations = correlateBankDetails(payments);

  step(9);
  const contradictions = detectContradictions(artifacts);
  const coverage = buildCoverage(artifacts, manifestTypes);

  return {
    id: `CASE-${Date.now().toString(36).toUpperCase()}`,
    name: caseName || zipName.replace(/\.zip$/i, ""),
    investigator: investigator || "Unassigned",
    createdAt: Date.now(),
    zipName,
    zipSha256,
    files: parsed.files,
    artifacts,
    entities,
    links,
    contradictions,
    anomalies,
    coverage,
    payments,
    bankCorrelations,
    index,
    verdicts: {},
    groundTruthFile: parsed.groundTruthFile,
    answers: [],
  };
}
