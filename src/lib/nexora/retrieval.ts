import type { Artifact, EvidenceIndex, IndexedDoc } from "./types";

const STOP = new Set(
  "the a an and or of to in on at is was were be been for with from by this that it as are am his her their our your my not no do does did what who when where which how why show tell me about".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}@.+_-]{2,}/gu) ?? [])
    .map((t) => t.replace(/^[.\-_]+|[.\-_]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

const DIM = 256;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Local deterministic embedding: hashed token + character trigram features.
 *  Runs fully offline in-browser (no model download, no network). */
export function embed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  for (const t of tokens) {
    v[hash(t) % DIM]! += 1;
    for (let i = 0; i < t.length - 2; i++) {
      v[hash(t.slice(i, i + 3)) % DIM]! += 0.5;
    }
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function docText(a: Artifact): string {
  return [
    a.type,
    a.source,
    a.text,
    a.parties.join(" "),
    a.app ?? "",
    a.place ?? "",
    a.direction ?? "",
    a.ts ? new Date(a.ts).toISOString() : "",
  ].join(" ");
}

export function buildIndex(artifacts: Artifact[]): EvidenceIndex {
  const docs: IndexedDoc[] = [];
  const df: Record<string, number> = {};
  let total = 0;
  for (const a of artifacts) {
    const tokens = tokenize(docText(a));
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    for (const t of Object.keys(tf)) df[t] = (df[t] ?? 0) + 1;
    total += tokens.length;
    docs.push({ artifactId: a.id, tokens: [], tf, len: tokens.length, vector: embed(docText(a)) });
  }
  return { docs, df, avgLen: docs.length ? total / docs.length : 0 };
}

export interface Hit {
  artifactId: string;
  score: number;
  lexical: number;
  semantic: number;
}

export function search(index: EvidenceIndex, query: string, topK = 12): Hit[] {
  const qTokens = tokenize(query);
  const qVec = embed(query);
  const N = index.docs.length || 1;
  const k1 = 1.4;
  const b = 0.72;
  const hits: Hit[] = [];
  for (const d of index.docs) {
    let lexical = 0;
    for (const t of qTokens) {
      const f = d.tf[t];
      if (!f) continue;
      const dfT = index.df[t] ?? 1;
      const idf = Math.log(1 + (N - dfT + 0.5) / (dfT + 0.5));
      lexical += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / (index.avgLen || 1))));
    }
    const semantic = cosine(qVec, d.vector);
    const score = lexical * 0.7 + semantic * 4;
    if (score > 0.05) hits.push({ artifactId: d.artifactId, score, lexical, semantic });
  }
  hits.sort((x, y) => y.score - x.score);
  return hits.slice(0, topK);
}
