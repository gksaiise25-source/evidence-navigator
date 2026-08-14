import { ARTIFACT_LABELS } from "./types";
import type {
  Anomaly,
  Artifact,
  ArtifactType,
  Contradiction,
  CoverageRow,
} from "./types";

const EXPECTED: ArtifactType[] = [
  "call",
  "contact",
  "sms",
  "chat",
  "gps",
  "browser",
  "app_usage",
  "notification",
  "account",
  "file",
  "wifi",
  "bluetooth",
  "device_event",
  "device_info",
  "manifest",
  "payment",
  "media",
];

export function buildCoverage(
  artifacts: Artifact[],
  manifestTypes: Set<ArtifactType>,
): CoverageRow[] {
  const counts = new Map<ArtifactType, number>();
  for (const a of artifacts) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  return EXPECTED.map((type) => {
    const count = counts.get(type) ?? 0;
    if (count > 0) {
      return {
        type,
        status: "AVAILABLE" as const,
        count,
        note: `${count} ${ARTIFACT_LABELS[type]} artifacts parsed from the extraction.`,
      };
    }
    if (manifestTypes.has(type)) {
      return {
        type,
        status: "NOT FOUND" as const,
        count: 0,
        note: `Listed in the extraction manifest but no parsable records were present. Absence of records is not evidence that the activity did not occur.`,
      };
    }
    return {
      type,
      status: "NOT EXTRACTED" as const,
      count: 0,
      note: `No ${ARTIFACT_LABELS[type]} file was present in this UFDR. This category was not extracted; nothing can be established about it.`,
    };
  });
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function detectAnomalies(artifacts: Artifact[]): Anomaly[] {
  const out: Anomaly[] = [];
  let seq = 0;
  const id = () => `AN-${String(++seq).padStart(3, "0")}`;

  // 1. Night-hour activity bursts
  const nightBuckets = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    if (a.ts === null) continue;
    const d = new Date(a.ts);
    const hour = d.getUTCHours();
    if (hour >= 0 && hour <= 5) {
      const key = d.toISOString().slice(0, 10);
      const arr = nightBuckets.get(key) ?? [];
      arr.push(a);
      nightBuckets.set(key, arr);
    }
  }
  for (const [day, items] of nightBuckets) {
    if (items.length >= 4) {
      out.push({
        id: id(),
        label: `Night-hour activity cluster (${day})`,
        detail: `${items.length} artifacts recorded between 00:00–05:59 UTC on ${day}. Investigative lead only — no conclusion is implied.`,
        ts: items[0]?.ts ?? null,
        evidenceIds: items.slice(0, 12).map((i) => i.id),
        signal: "temporal_density",
      });
    }
  }

  // 2. Deleted / recovered artifacts
  const deleted = artifacts.filter((a) => a.deleted);
  if (deleted.length) {
    out.push({
      id: id(),
      label: `${deleted.length} deleted or recovered artifacts`,
      detail:
        "Artifacts flagged as deleted/recovered in the extraction. Deletion alone does not establish intent.",
      ts: deleted[0]?.ts ?? null,
      evidenceIds: deleted.slice(0, 12).map((a) => a.id),
      signal: "deleted_artifact",
    });
  }

  // 3. Improbable movement between consecutive GPS fixes
  const gps = artifacts
    .filter((a) => a.lat !== null && a.lon !== null && a.ts !== null)
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (let i = 1; i < gps.length; i++) {
    const p = gps[i - 1];
    const c = gps[i];
    if (!p || !c) continue;
    const hours = ((c.ts ?? 0) - (p.ts ?? 0)) / 3600000;
    if (hours <= 0 || hours > 6) continue;
    const km = haversineKm(p.lat!, p.lon!, c.lat!, c.lon!);
    const speed = km / hours;
    if (speed > 300) {
      out.push({
        id: id(),
        label: `Improbable travel speed (${Math.round(speed)} km/h)`,
        detail: `Consecutive location fixes imply ${km.toFixed(1)} km in ${hours.toFixed(2)} h. Could indicate spoofing, timezone error, or a second device. Investigative lead only.`,
        ts: c.ts,
        evidenceIds: [p.id, c.id],
        signal: "geo_velocity",
      });
    }
  }

  // 4. Large-value payments
  for (const a of artifacts) {
    if (a.type !== "payment") continue;
    const m = a.text.match(/(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)/i);
    const amount = m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
    if (amount !== null && amount >= 50000) {
      out.push({
        id: id(),
        label: `High-value payment artifact (₹${amount.toLocaleString("en-IN")})`,
        detail: "Amount exceeds the review threshold. Flagged as an investigative lead only.",
        ts: a.ts,
        evidenceIds: [a.id],
        signal: "financial_value",
      });
    }
  }

  // 5. Communication gaps for otherwise active parties
  return out.slice(0, 200);
}

const PLACE_HINT_RE =
  /\b(?:at|in|near|reached|meet(?:ing)? at|warehouse|airport|station|hotel|market|mall|office|godown|port|dock)\s?([A-Z][\w' -]{2,24})?/;

export function detectContradictions(artifacts: Artifact[]): Contradiction[] {
  const out: Contradiction[] = [];
  let seq = 0;
  const gps = artifacts.filter((a) => a.lat !== null && a.lon !== null && a.ts !== null);
  const msgs = artifacts.filter(
    (a) => (a.type === "sms" || a.type === "chat") && a.ts !== null && PLACE_HINT_RE.test(a.text),
  );

  for (const m of msgs) {
    const claimed = m.text.match(PLACE_HINT_RE)?.[0]?.trim();
    if (!claimed) continue;
    const near = gps
      .filter((g) => Math.abs((g.ts ?? 0) - (m.ts ?? 0)) < 90 * 60000)
      .sort((a, b) => Math.abs((a.ts ?? 0) - (m.ts ?? 0)) - Math.abs((b.ts ?? 0) - (m.ts ?? 0)))[0];
    if (!near) continue;
    const gpsLabel = near.place ?? `${near.lat?.toFixed(4)}, ${near.lon?.toFixed(4)}`;
    const claimedToken = claimed.replace(/^(at|in|near)\s+/i, "").toLowerCase();
    if (claimedToken && gpsLabel.toLowerCase().includes(claimedToken)) continue;
    seq += 1;
    out.push({
      id: `CT-${String(seq).padStart(3, "0")}`,
      kind: "Message location vs GPS location",
      summary: `A message references "${claimed}" while the nearest device location fix reports ${gpsLabel}. Both sources are presented; neither is automatically treated as true.`,
      sideA: {
        label: "Message content",
        evidenceId: m.id,
        ts: m.ts,
        detail: m.text.slice(0, 240),
      },
      sideB: {
        label: "Device GPS fix",
        evidenceId: near.id,
        ts: near.ts,
        detail: `${gpsLabel}${near.place ? "" : " (raw coordinates)"}`,
      },
    });
    if (out.length >= 60) break;
  }

  // Overlapping call records with the same party at the same time
  const calls = artifacts.filter((a) => a.type === "call" && a.ts !== null);
  for (let i = 1; i < calls.length; i++) {
    const p = calls[i - 1];
    const c = calls[i];
    if (!p || !c) continue;
    if (Math.abs((c.ts ?? 0) - (p.ts ?? 0)) < 5000 && p.parties.join() !== c.parties.join()) {
      seq += 1;
      out.push({
        id: `CT-${String(seq).padStart(3, "0")}`,
        kind: "Concurrent call records",
        summary:
          "Two call records with different parties share effectively the same timestamp. Could indicate a duplicate record, a second device, or a parsing/timezone artifact.",
        sideA: { label: "Call record A", evidenceId: p.id, ts: p.ts, detail: p.text.slice(0, 200) },
        sideB: { label: "Call record B", evidenceId: c.id, ts: c.ts, detail: c.text.slice(0, 200) },
      });
      if (out.length >= 80) break;
    }
  }
  return out;
}
