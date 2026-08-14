import {
  ACCT_RE,
  EMAIL_RE,
  IFSC_RE,
  UPI_RE,
  looksLikePhone,
  normalizePhone,
} from "./parse";
import type { Artifact, Entity, EntityKind, Link, LinkStatus } from "./types";

export function statusFor(confidence: number): LinkStatus {
  if (confidence >= 0.85) return "CONFIRMED";
  if (confidence >= 0.6) return "PROBABLE";
  if (confidence >= 0.4) return "POSSIBLE";
  return "UNVERIFIED";
}

function matchAll(text: string, re: RegExp): string[] {
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return [...text.matchAll(rx)].map((m) => m[0]);
}

class EntityBuilder {
  private map = new Map<string, Entity>();
  private seq = 0;

  key(kind: EntityKind, value: string) {
    return `${kind}:${value.toLowerCase()}`;
  }

  upsert(kind: EntityKind, value: string, label: string, artifact?: Artifact): Entity {
    const k = this.key(kind, value);
    let e = this.map.get(k);
    if (!e) {
      this.seq += 1;
      e = {
        id: `ENT-${String(this.seq).padStart(4, "0")}`,
        kind,
        value,
        label,
        aliases: [],
        artifactIds: [],
        firstSeen: null,
        lastSeen: null,
      };
      this.map.set(k, e);
    }
    if (label && label !== e.label && !e.aliases.includes(label) && label !== e.value) {
      e.aliases.push(label);
    }
    if (artifact) {
      if (!e.artifactIds.includes(artifact.id)) e.artifactIds.push(artifact.id);
      if (artifact.ts !== null) {
        e.firstSeen = e.firstSeen === null ? artifact.ts : Math.min(e.firstSeen, artifact.ts);
        e.lastSeen = e.lastSeen === null ? artifact.ts : Math.max(e.lastSeen, artifact.ts);
      }
    }
    return e;
  }

  find(kind: EntityKind, value: string) {
    return this.map.get(this.key(kind, value));
  }

  all() {
    return [...this.map.values()];
  }
}

class LinkBuilder {
  private map = new Map<string, Link>();
  private seq = 0;

  add(
    from: string,
    to: string,
    type: string,
    method: string,
    confidence: number,
    evidenceId: string | null,
  ) {
    if (from === to) return;
    const k = [from, to].sort().join("|") + "|" + type;
    let l = this.map.get(k);
    if (!l) {
      this.seq += 1;
      l = {
        id: `LNK-${String(this.seq).padStart(4, "0")}`,
        from,
        to,
        type,
        method,
        confidence,
        status: statusFor(confidence),
        evidenceIds: [],
      };
      this.map.set(k, l);
    }
    if (evidenceId && !l.evidenceIds.includes(evidenceId)) l.evidenceIds.push(evidenceId);
    // corroboration raises confidence, capped by method ceiling
    const boosted = Math.min(0.97, confidence + Math.max(0, l.evidenceIds.length - 1) * 0.03);
    l.confidence = Math.max(l.confidence, boosted);
    l.status = statusFor(l.confidence);
  }

  all() {
    return [...this.map.values()];
  }
}

const MERCHANT_RE = /(?:paid to|to|at|received from|from)\s+([A-Z][\w&.' -]{2,30})/i;

export function buildEntitiesAndLinks(artifacts: Artifact[]): { entities: Entity[]; links: Link[] } {
  const E = new EntityBuilder();
  const L = new LinkBuilder();

  // Pass 1 — contacts create person identities anchored on phone numbers
  for (const a of artifacts) {
    if (a.type !== "contact") continue;
    const name = Object.entries(a.raw).find(
      ([k, v]) => /name/i.test(k) && v && !looksLikePhone(v),
    )?.[1];
    const phones = a.parties.filter((p) => /^\d{10,}$/.test(p));
    if (name) {
      const person = E.upsert("person", name, name, a);
      for (const p of phones) {
        const phone = E.upsert("phone", p, p, a);
        L.add(person.id, phone.id, "uses_phone", "contact_record", 0.9, a.id);
      }
    } else {
      for (const p of phones) E.upsert("phone", p, p, a);
    }
  }

  // Pass 2 — everything else
  for (const a of artifacts) {
    const local: string[] = [];

    for (const p of a.parties) {
      if (/^\d{10,}$/.test(p)) {
        local.push(E.upsert("phone", p, p, a).id);
      } else if (looksLikePhone(p)) {
        local.push(E.upsert("phone", normalizePhone(p), p, a).id);
      } else if (p.length > 1 && p.length < 60) {
        const kind: EntityKind =
          a.type === "chat" || a.type === "account" ? "handle" : "person";
        const ent = E.upsert(kind, p, p, a);
        local.push(ent.id);
        // a named person seen in a contact list links to that identity
        const known = E.find("person", p);
        if (known && known.id !== ent.id) {
          L.add(known.id, ent.id, "same_identity", "name_match", 0.65, a.id);
        }
      }
    }

    if (a.app) local.push(E.upsert("app", a.app, a.app, a).id);

    if (a.lat !== null && a.lon !== null) {
      const value = `${a.lat.toFixed(3)},${a.lon.toFixed(3)}`;
      local.push(E.upsert("location", value, a.place ?? value, a).id);
    } else if (a.place) {
      local.push(E.upsert("location", a.place, a.place, a).id);
    }

    if (a.type === "device_info" || a.type === "bluetooth" || a.type === "wifi") {
      const label = a.text.split(" | ")[0] ?? a.text;
      if (label) local.push(E.upsert("device", label.slice(0, 50), label.slice(0, 50), a).id);
    }

    if (a.type === "media" || a.type === "file") {
      const label = a.text.split(" | ")[0] ?? a.text;
      if (label) local.push(E.upsert("media", label.slice(0, 60), label.slice(0, 60), a).id);
      const faceKey = Object.entries(a.raw).find(([k]) => /face|person_id|subject/i.test(k))?.[1];
      if (faceKey) {
        const face = E.upsert("face", faceKey, `Face ${faceKey}`, a);
        local.push(face.id);
        const person = E.find("person", faceKey);
        if (person) L.add(person.id, face.id, "has_face", "face_label_in_extraction", 0.7, a.id);
      }
    }

    const haystack = `${a.text} ${Object.values(a.raw).join(" ")}`;
    for (const vpa of matchAll(haystack, UPI_RE)) {
      local.push(E.upsert("upi", vpa.toLowerCase(), vpa, a).id);
    }
    for (const em of matchAll(haystack, EMAIL_RE)) {
      if (UPI_RE.test(em)) {
        UPI_RE.lastIndex = 0;
        continue;
      }
      UPI_RE.lastIndex = 0;
      local.push(E.upsert("email", em.toLowerCase(), em, a).id);
    }
    for (const ifsc of matchAll(haystack, IFSC_RE)) {
      local.push(E.upsert("account", ifsc, `IFSC ${ifsc}`, a).id);
    }
    for (const acct of matchAll(haystack, ACCT_RE)) {
      local.push(E.upsert("account", acct, acct, a).id);
    }
    if (a.type === "payment") {
      const m = a.text.match(MERCHANT_RE);
      if (m?.[1]) local.push(E.upsert("merchant", m[1].trim(), m[1].trim(), a).id);
    }

    // Co-occurrence links within a single evidence item
    const unique = [...new Set(local)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const from = unique[i];
        const to = unique[j];
        if (!from || !to) continue;
        const { type, conf } = relationFor(a.type);
        L.add(from, to, type, `co-occurrence in ${a.type} artifact`, conf, a.id);
      }
    }
  }

  return { entities: E.all(), links: L.all() };
}

function relationFor(t: Artifact["type"]): { type: string; conf: number } {
  switch (t) {
    case "call":
      return { type: "communicated_with", conf: 0.8 };
    case "sms":
    case "chat":
      return { type: "messaged", conf: 0.75 };
    case "payment":
      return { type: "financial_link", conf: 0.7 };
    case "gps":
      return { type: "present_at", conf: 0.65 };
    case "contact":
      return { type: "contact_of", conf: 0.85 };
    case "media":
      return { type: "appears_with", conf: 0.5 };
    case "account":
      return { type: "account_link", conf: 0.6 };
    case "wifi":
    case "bluetooth":
      return { type: "device_proximity", conf: 0.55 };
    default:
      return { type: "co_occurs_with", conf: 0.4 };
  }
}
