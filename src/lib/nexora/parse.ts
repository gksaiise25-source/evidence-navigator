import { unzipSync, strFromU8 } from "fflate";
import { sha256 } from "./hash";
import type { Artifact, ArtifactType, CaseFileMeta } from "./types";

/* ------------------------------- CSV / JSON ------------------------------- */

export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const first = rows[0];
  if (!first) return [];
  const header = first.map((h, i) => h.trim() || `col_${i}`);
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
}

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix || "value"] = String(value);
  return out;
}

export function parseJsonRows(text: string): Record<string, string>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const collect = (v: unknown): Record<string, string>[] => {
    if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "object" && x ? [flatten(x)] : []));
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
      if (arrayKey) return collect(obj[arrayKey]);
      return [flatten(obj)];
    }
    return [];
  };
  return collect(data);
}

/* ------------------------------ type detection ---------------------------- */

const TYPE_RULES: [RegExp, ArtifactType][] = [
  [/manifest|extraction[_-]?info|report[_-]?info/i, "manifest"],
  [/device[_-]?info|handset|hardware/i, "device_info"],
  [/device[_-]?event|power|boot|log/i, "device_event"],
  [/(upi|payment|transaction|txn|financial|bank|wallet)/i, "payment"],
  [/whatsapp|telegram|signal|chat|messenger|imessage/i, "chat"],
  [/sms|mms|text[_-]?message/i, "sms"],
  [/call/i, "call"],
  [/contact|phonebook|addressbook/i, "contact"],
  [/gps|location|geo|cell[_-]?site/i, "gps"],
  [/browser|history|url|search/i, "browser"],
  [/app[_-]?usage|application|installed/i, "app_usage"],
  [/notification/i, "notification"],
  [/account|credential|login/i, "account"],
  [/wifi|wlan|ssid/i, "wifi"],
  [/bluetooth|\bbt\b/i, "bluetooth"],
  [/photo|image|media|video|gallery|face/i, "media"],
  [/file|deleted|recover|document/i, "file"],
];

export function detectType(fileName: string, sample?: Record<string, string>): ArtifactType {
  const base = fileName.split("/").pop() ?? fileName;
  for (const [re, t] of TYPE_RULES) if (re.test(base)) return t;
  if (sample) {
    const keys = Object.keys(sample).join(" ").toLowerCase();
    for (const [re, t] of TYPE_RULES) if (re.test(keys)) return t;
  }
  return "unknown";
}

/* --------------------------- field normalization -------------------------- */

const K = {
  ts: /(timestamp|date_?time|datetime|^date$|^time$|_ts$|^ts$|start_?time|occurred|created|visit|last_?used|sent_?at|when)/i,
  party:
    /(number|phone|msisdn|mobile|from|to|sender|recipient|receiver|party|caller|callee|contact|participant|name|handle|username|user|jid|display_?name|owner|counterpart)/i,
  text: /(body|text|message|content|snippet|title|url|subject|description|note|summary|caption|detail|event|label|ssid|device_?name|file_?name|path|query|activity)/i,
  lat: /(^lat$|latitude|lat_)/i,
  lon: /(^lon$|^lng$|longitude|long_)/i,
  app: /(^app$|app_?name|package|platform|source_?app|application|service)/i,
  dir: /(direction|call_?type|msg_?type|in_?out|folder|status)/i,
  del: /(deleted|is_?deleted|recovered|trash)/i,
  place: /(place|address|location_?name|city|area|landmark)/i,
};

export function parseTimestamp(v: string): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  if (/^\d{13}$/.test(s)) return Number(s);
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    const t = Date.parse(`${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi.padStart(2, "0")}:${se.padStart(2, "0")}Z`);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function pick(row: Record<string, string>, re: RegExp): string[] {
  return Object.entries(row)
    .filter(([k, v]) => re.test(k) && v && v !== "null" && v !== "undefined")
    .map(([, v]) => v);
}

const PHONE_RE = /(?:\+?\d[\d\s-]{7,15}\d)/g;
export const UPI_RE = /\b[\w.\-]{2,}@(?:ok\w+|ybl|paytm|upi|axl|apl|ibl|sbi|hdfcbank|icici|axisbank|\w{2,})\b/gi;
export const TXN_RE = /\b(?:txn|utr|ref(?:erence)?(?:\s*(?:no|id))?|transaction\s*id)\D{0,6}([A-Z0-9]{6,22})\b/gi;
export const AMOUNT_RE = /(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s?(?:rs|inr|rupees)\b/gi;
export const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
export const ACCT_RE = /\b(?:a\/c|acc(?:ount)?)\D{0,6}(?:x{2,}|\*{2,})?(\d{3,6})\b/gi;
export const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;

export function normalizePhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function looksLikePhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 && /^[+\d\s-]+$/.test(v.trim());
}

let counter = 0;
export function resetIds() {
  counter = 0;
}
function nextId() {
  counter += 1;
  return `EV-${String(counter).padStart(6, "0")}`;
}

export function rowToArtifact(
  row: Record<string, string>,
  type: ArtifactType,
  source: string,
): Artifact {
  const tsRaw = pick(row, K.ts)[0] ?? "";
  const ts = parseTimestamp(tsRaw);
  const parties = new Set<string>();
  for (const p of pick(row, K.party)) {
    const trimmed = p.trim();
    if (!trimmed || trimmed.length > 80) continue;
    parties.add(looksLikePhone(trimmed) ? normalizePhone(trimmed) : trimmed);
  }
  const textParts = pick(row, K.text);
  const body = textParts.join(" | ").slice(0, 1200);
  for (const m of body.matchAll(PHONE_RE)) {
    const n = normalizePhone(m[0]);
    if (n.length === 10) parties.add(n);
  }
  const lat = Number(pick(row, K.lat)[0]);
  const lon = Number(pick(row, K.lon)[0]);
  const delRaw = (pick(row, K.del)[0] ?? "").toLowerCase();
  const isPayment =
    type === "payment" ||
    UPI_RE.test(body) ||
    /debited|credited|upi|paid to|received from|transaction/i.test(body);
  UPI_RE.lastIndex = 0;

  return {
    id: nextId(),
    type: isPayment && (type === "sms" || type === "notification" || type === "payment") ? "payment" : type,
    source,
    ts,
    text: body || Object.values(row).slice(0, 6).join(" | "),
    parties: [...parties],
    app: pick(row, K.app)[0] ?? null,
    direction: pick(row, K.dir)[0] ?? null,
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lon: Number.isFinite(lon) && lon !== 0 ? lon : null,
    place: pick(row, K.place)[0] ?? null,
    deleted: delRaw === "true" || delRaw === "1" || delRaw === "yes",
    raw: row,
  };
}

/* --------------------------------- unzip ---------------------------------- */

export interface ParsedUfdr {
  files: CaseFileMeta[];
  artifacts: Artifact[];
  groundTruthFile: string | null;
  skipped: string[];
}

const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

export async function parseUfdrZip(
  zipBytes: Uint8Array,
  onProgress?: (msg: string) => void,
): Promise<ParsedUfdr> {
  resetIds();
  const entries = unzipSync(zipBytes);
  const files: CaseFileMeta[] = [];
  const artifacts: Artifact[] = [];
  const skipped: string[] = [];
  let groundTruthFile: string | null = null;

  for (const [name, bytes] of Object.entries(entries)) {
    const base = name.split("/").pop() ?? name;
    // safe ZIP handling: reject traversal, hidden dirs, oversized entries
    if (!base || base.startsWith(".") || name.includes("..") || name.endsWith("/")) {
      skipped.push(`${name} (unsafe or directory entry)`);
      continue;
    }
    if (bytes.byteLength > MAX_ENTRY_BYTES) {
      skipped.push(`${name} (exceeds size limit)`);
      continue;
    }
    if (!/\.(csv|json|txt|tsv)$/i.test(base)) {
      skipped.push(`${name} (unsupported format — not parsed)`);
      continue;
    }
    onProgress?.(`Parsing ${base}`);
    const text = strFromU8(bytes);
    const digest = await sha256(bytes);
    const isGroundTruth = /ground[_-]?truth/i.test(base);
    let rows = /\.json$/i.test(base) ? parseJsonRows(text) : parseCsv(text);
    if (!rows.length && /\.json$/i.test(base)) rows = parseCsv(text);
    const type = detectType(base, rows[0]);

    files.push({ name, size: bytes.byteLength, sha256: digest, rows: rows.length, type });

    if (isGroundTruth) {
      groundTruthFile = name;
      continue; // evaluation only — never ingested as investigator evidence
    }
    for (const row of rows) artifacts.push(rowToArtifact(row, type, base));
  }

  artifacts.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return { files, artifacts, groundTruthFile, skipped };
}
