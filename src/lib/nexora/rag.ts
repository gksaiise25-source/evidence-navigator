import { search } from "./retrieval";
import { ollamaGenerate } from "./ollama";
import type {
  AnswerStatus,
  Artifact,
  CaseBundle,
  Entity,
  Link,
  SavedAnswer,
} from "./types";

export interface RagOptions {
  topK: number;
  useLlm: boolean;
  ollamaUrl: string;
  ollamaModel: string;
}

export function fmtTime(ts: number | null) {
  if (ts === null) return "unknown time";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function parseTimeWindow(q: string): { from: number; to: number } | null {
  const m = q.match(/between\s+(\d{1,2})(?::(\d{2}))?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return null;
  const h1 = Number(m[1]);
  const m1 = Number(m[2] ?? 0);
  const h2 = Number(m[3]);
  const m2 = Number(m[4] ?? 0);
  return { from: h1 * 60 + m1, to: h2 * 60 + m2 };
}

function minutesOf(ts: number) {
  const d = new Date(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export interface EvidencePack {
  artifacts: Artifact[];
  entities: Entity[];
  links: Link[];
  contradictionIds: string[];
  missing: string[];
  window: { from: number; to: number } | null;
  financialFocus: boolean;
  scores: Record<string, number>;
}

const FIN_RE = /financ|payment|upi|money|transaction|bank|paid|amount|txn|account/i;
const MISSING_RE = /missing|absent|not (?:found|available)|gaps?/i;

export function retrieveEvidence(bundle: CaseBundle, question: string, topK: number): EvidencePack {
  const byId = new Map(bundle.artifacts.map((a) => [a.id, a]));
  const hits = search(bundle.index, question, topK);
  const scores: Record<string, number> = {};
  let artifacts: Artifact[] = [];
  for (const h of hits) {
    const a = byId.get(h.artifactId);
    if (a) {
      artifacts.push(a);
      scores[a.id] = h.score;
    }
  }

  const window = parseTimeWindow(question);
  if (window) {
    const inWindow = bundle.artifacts.filter(
      (a) => a.ts !== null && minutesOf(a.ts) >= window.from && minutesOf(a.ts) <= window.to,
    );
    const merged = new Map<string, Artifact>();
    for (const a of inWindow.slice(0, 60)) merged.set(a.id, a);
    for (const a of artifacts) merged.set(a.id, a);
    artifacts = [...merged.values()];
  }

  const financialFocus = FIN_RE.test(question);
  if (financialFocus) {
    for (const p of bundle.payments.slice(0, 25)) {
      const a = byId.get(p.evidenceId);
      if (a && !artifacts.some((x) => x.id === a.id)) artifacts.push(a);
    }
  }

  // Graph expansion: entities mentioned in retrieved evidence + their links
  const evidenceIds = new Set(artifacts.map((a) => a.id));
  const qLower = question.toLowerCase();
  const entities = bundle.entities.filter(
    (e) =>
      e.artifactIds.some((id) => evidenceIds.has(id)) ||
      qLower.includes(e.value.toLowerCase()) ||
      qLower.includes(e.label.toLowerCase()),
  );
  const entIds = new Set(entities.map((e) => e.id));
  const links = bundle.links.filter((l) => entIds.has(l.from) && entIds.has(l.to));

  // second hop: pull evidence backing the strongest links
  for (const l of links.slice(0, 40)) {
    for (const id of l.evidenceIds.slice(0, 2)) {
      const a = byId.get(id);
      if (a && !evidenceIds.has(id)) {
        artifacts.push(a);
        evidenceIds.add(id);
      }
    }
  }

  artifacts.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  const contradictionIds = bundle.contradictions
    .filter((c) => evidenceIds.has(c.sideA.evidenceId) || evidenceIds.has(c.sideB.evidenceId))
    .map((c) => c.id);

  const missing = bundle.coverage
    .filter((c) => c.status !== "AVAILABLE")
    .filter((c) => (financialFocus ? true : MISSING_RE.test(question) || qLower.includes(c.type)))
    .map((c) => `${c.type}: ${c.status} — ${c.note}`);

  return { artifacts, entities, links, contradictionIds, missing, window, financialFocus, scores };
}

function evidenceBlock(pack: EvidencePack, limit = 40): string {
  return pack.artifacts
    .slice(0, limit)
    .map(
      (a) =>
        `[${a.id}] type=${a.type} source=${a.source} time=${fmtTime(a.ts)}` +
        (a.parties.length ? ` parties=${a.parties.join(",")}` : "") +
        (a.lat !== null ? ` gps=${a.lat},${a.lon}` : "") +
        (a.place ? ` place=${a.place}` : "") +
        ` :: ${a.text.slice(0, 300)}`,
    )
    .join("\n");
}

function deterministicAnswer(bundle: CaseBundle, pack: EvidencePack, question: string): string {
  const lines: string[] = [];
  const relEntities = pack.entities.slice(0, 12);
  if (relEntities.length) {
    lines.push(
      `Entities present in the retrieved evidence: ${relEntities
        .map((e) => `${e.label} (${e.kind})`)
        .join(", ")}.`,
    );
  }
  const strongLinks = [...pack.links].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
  const nameOf = (id: string) => bundle.entities.find((e) => e.id === id)?.label ?? id;
  for (const l of strongLinks) {
    lines.push(
      `${nameOf(l.from)} — ${l.type} — ${nameOf(l.to)} [${l.status}, confidence ${(l.confidence * 100).toFixed(0)}%, method: ${l.method}] supported by ${l.evidenceIds.slice(0, 4).join(", ")}.`,
    );
  }
  const events = pack.artifacts.slice(0, 8);
  if (events.length) {
    lines.push("Evidence-backed sequence:");
    for (const a of events) {
      lines.push(`• ${fmtTime(a.ts)} — ${a.type} — ${a.text.slice(0, 160)} [${a.id}]`);
    }
  }
  if (pack.financialFocus) {
    const pays = bundle.payments.filter((p) => pack.artifacts.some((a) => a.id === p.evidenceId));
    if (pays.length) {
      lines.push(
        `Financial artifacts: ${pays
          .slice(0, 6)
          .map(
            (p) =>
              `${p.amount !== null ? `₹${p.amount}` : "amount not recorded"}${p.vpaTo ? ` → ${p.vpaTo}` : ""}${p.txnId ? ` txn ${p.txnId}` : ""} [${p.evidenceId}]`,
          )
          .join("; ")}.`,
      );
    } else {
      lines.push(
        "No relevant payment artifact was found in the available extraction for this question.",
      );
    }
  }
  lines.push(
    "This is a retrieval-only reconstruction of the available extraction. It states what the artifacts record, not what occurred.",
  );
  return lines.join("\n");
}

function insufficientAnswer(bundle: CaseBundle, question: string, pack: EvidencePack): string {
  const available = bundle.coverage
    .filter((c) => c.status === "AVAILABLE")
    .map((c) => `${c.type} (${c.count})`)
    .join(", ");
  const notAvailable = bundle.coverage.filter((c) => c.status !== "AVAILABLE");
  return [
    "DATA INSUFFICIENT",
    "",
    `No evidence in this extraction supports an answer to: "${question}".`,
    "",
    `Available evidence categories: ${available || "none parsed"}.`,
    `Missing / not extracted: ${
      notAvailable.map((c) => `${c.type} (${c.status})`).join(", ") || "none"
    }.`,
    "",
    "What cannot be established: nothing about this question can be confirmed or denied from the available extraction. Absence of records is not evidence that the activity did not occur.",
    pack.artifacts.length
      ? `Nearest retrieved but non-responsive artifacts: ${pack.artifacts
          .slice(0, 5)
          .map((a) => a.id)
          .join(", ")}.`
      : "No artifact scored above the retrieval threshold.",
  ].join("\n");
}

export async function askNexora(
  bundle: CaseBundle,
  question: string,
  opts: RagOptions,
): Promise<SavedAnswer> {
  const pack = retrieveEvidence(bundle, question, opts.topK);
  const nameOf = (id: string) => bundle.entities.find((e) => e.id === id)?.label ?? id;

  const enough = pack.artifacts.length >= 1;
  let status: AnswerStatus = enough ? "ANSWERED" : "DATA INSUFFICIENT";
  let engine = "Graph-RAG (deterministic evidence composer)";
  let answer = enough
    ? deterministicAnswer(bundle, pack, question)
    : insufficientAnswer(bundle, question, pack);

  if (enough && opts.useLlm) {
    const prompt = [
      "EVIDENCE (the only permitted source of facts):",
      evidenceBlock(pack),
      "",
      "ENTITIES:",
      pack.entities
        .slice(0, 25)
        .map((e) => `${e.id} ${e.kind}: ${e.label}${e.aliases.length ? ` (aliases: ${e.aliases.join(", ")})` : ""}`)
        .join("\n") || "none",
      "",
      "RELATIONSHIPS (evidence-backed):",
      pack.links
        .slice(0, 25)
        .map(
          (l) =>
            `${nameOf(l.from)} -[${l.type}]- ${nameOf(l.to)} | ${l.status} | conf ${l.confidence.toFixed(2)} | ${l.method} | evidence ${l.evidenceIds.join(",")}`,
        )
        .join("\n") || "none",
      "",
      "KNOWN CONTRADICTIONS:",
      bundle.contradictions
        .filter((c) => pack.contradictionIds.includes(c.id))
        .map((c) => `${c.id}: ${c.summary}`)
        .join("\n") || "none",
      "",
      "MISSING / NOT EXTRACTED CATEGORIES:",
      pack.missing.join("\n") || "none flagged for this question",
      "",
      `QUESTION: ${question}`,
      "",
      "Answer strictly from the evidence above, citing evidence IDs. If it is insufficient, reply DATA INSUFFICIENT and explain available evidence, missing evidence and what cannot be established.",
    ].join("\n");

    const res = await ollamaGenerate(opts.ollamaUrl, opts.ollamaModel, prompt);
    if (res.ok) {
      answer = res.text;
      engine = `Local Llama via Ollama (${res.model})`;
      if (/^data insufficient/i.test(res.text.trim())) status = "DATA INSUFFICIENT";
    } else {
      engine = `Graph-RAG deterministic composer — local model unavailable (${res.error})`;
    }
  }

  const evidenceIds = pack.artifacts.map((a) => a.id);
  const avgScore =
    evidenceIds.reduce((s, id) => s + (pack.scores[id] ?? 0), 0) / (evidenceIds.length || 1);
  const linkConf = pack.links.length
    ? pack.links.reduce((s, l) => s + l.confidence, 0) / pack.links.length
    : 0;
  const confidence =
    status === "DATA INSUFFICIENT"
      ? 0
      : Math.max(
          0.05,
          Math.min(0.95, 0.3 * Math.min(1, avgScore / 6) + 0.4 * linkConf + 0.3 * Math.min(1, evidenceIds.length / 10)),
        );
  if (status === "ANSWERED" && (confidence < 0.35 || evidenceIds.length < 3)) status = "PARTIAL";

  const trace = {
    question,
    retrieved: evidenceIds
      .slice(0, 20)
      .map((id) => `${id} (score ${(pack.scores[id] ?? 0).toFixed(2)})`),
    entities: pack.entities.slice(0, 20).map((e) => `${e.id} ${e.kind}: ${e.label}`),
    relationships: pack.links
      .slice(0, 20)
      .map(
        (l) => `${nameOf(l.from)} -[${l.type}]- ${nameOf(l.to)} (${l.status}, ${(l.confidence * 100).toFixed(0)}%)`,
      ),
    timeline: pack.artifacts
      .slice(0, 20)
      .map((a) => `${fmtTime(a.ts)} — ${a.type} — ${a.text.slice(0, 120)} [${a.id}]`),
    supporting: evidenceIds.slice(0, 20),
    contradictions: bundle.contradictions
      .filter((c) => pack.contradictionIds.includes(c.id))
      .map((c) => `${c.id}: ${c.summary}`),
    missing: pack.missing.length
      ? pack.missing
      : ["No category flagged as missing for this question."],
    confidenceSignals: [
      `Retrieved artifacts: ${evidenceIds.length}`,
      `Mean retrieval score: ${avgScore.toFixed(2)}`,
      `Mean relationship confidence: ${(linkConf * 100).toFixed(0)}%`,
      `Contradictions touching this evidence: ${pack.contradictionIds.length}`,
      `Answer engine: ${engine}`,
    ],
    conclusion:
      status === "DATA INSUFFICIENT"
        ? "DATA INSUFFICIENT — no responsive evidence in the available extraction."
        : "Conclusion is limited to what the cited artifacts record.",
  };

  return {
    id: `ANS-${Date.now().toString(36)}`,
    question,
    answer,
    status,
    engine,
    evidenceIds,
    sources: [...new Set(pack.artifacts.map((a) => a.source))],
    confidence,
    contradictions: pack.contradictionIds,
    missing: trace.missing,
    trace,
    createdAt: Date.now(),
  };
}
