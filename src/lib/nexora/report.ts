import { jsPDF } from "jspdf";
import { fmtTime } from "./rag";
import type { CanvasMap, CaseBundle } from "./types";

type Tag = "FACT" | "AI INTERPRETATION" | "INVESTIGATIVE LEAD" | "CONTRADICTION" | "DATA INSUFFICIENT" | "HUMAN VERIFIED";

/**
 * Concise forensic summary — hard limit of 5 pages.
 * Page 1 case summary · 2 key findings · 3 investigation map · 4 warnings · 5 AI + verification.
 */
export function generateReport(bundle: CaseBundle): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const BOTTOM = H - 46;
  let y = M;
  let page = 1;

  const room = (needed = 14) => y + needed <= BOTTOM;

  const newPage = (title: string) => {
    if (page > 1) doc.addPage();
    page += 1;
    y = M;
    doc.setFillColor(8, 12, 11);
    doc.rect(0, 0, W, 54, "F");
    doc.setTextColor(80, 240, 170);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("NEXORA", M, 26);
    doc.setFontSize(10);
    doc.setTextColor(200, 255, 230);
    doc.text(title, M, 43);
    doc.setTextColor(20);
    y = 76;
  };

  const h2 = (t: string) => {
    if (!room(30)) return false;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(10, 90, 60);
    doc.text(t, M, y);
    y += 5;
    doc.setDrawColor(10, 130, 90);
    doc.line(M, y, W - M, y);
    y += 13;
    doc.setTextColor(20);
    return true;
  };

  const body = (t: string, indent = 0) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    const lines = doc.splitTextToSize(t, W - M * 2 - indent) as string[];
    for (const line of lines) {
      if (!room(11)) return false;
      doc.text(line, M + indent, y);
      y += 10.5;
    }
    return true;
  };

  const tagged = (tag: Tag, t: string) => {
    if (!room(12)) return false;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(`[${tag}]`, M, y);
    doc.setTextColor(20);
    return body(t, 92);
  };

  const truncated = () => {
    if (room(11)) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text("… further detail withheld: this document is a 5-page summary. Full data remains in the case file.", M, y);
      doc.setTextColor(20);
      y += 11;
    }
  };

  const nameOf = (id: string) => bundle.entities.find((e) => e.id === id)?.label ?? id;

  /* ------------------------------ PAGE 1 ------------------------------ */
  newPage("PAGE 1 / 5 — CASE SUMMARY");
  h2("Case identification");
  body(`Case ID: ${bundle.id}   |   Case name: ${bundle.name}   |   Investigator of record: ${bundle.investigator}`);
  body(`Processed (local, offline): ${fmtTime(bundle.createdAt)}   |   Report generated: ${new Date().toISOString().slice(0, 19)}Z`);
  body(`UFDR package: ${bundle.zipName}`);
  body(`Package SHA-256: ${bundle.zipSha256}`);
  body(`Ground-truth file: ${bundle.groundTruthFile ?? "none"} — evaluation only, never used as investigative evidence.`);

  h2("Artifact summary");
  const counts = new Map<string, number>();
  for (const a of bundle.artifacts) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  body(
    `${bundle.artifacts.length} artifacts across ${bundle.files.length} extracted file(s): ${[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t} ${c}`)
      .join(", ")}`,
  );
  body(
    `${bundle.entities.length} entities · ${bundle.links.length} relationships · ${bundle.payments.length} payment artifact(s) · ${bundle.anomalies.length} investigative lead(s) · ${bundle.contradictions.length} contradiction(s)`,
  );
  body(`Evidence categories unavailable: ${bundle.coverage.filter((c) => c.status !== "AVAILABLE").length}`);

  h2("Key entities (by supporting evidence volume)");
  const keyEntities = [...bundle.entities].sort((a, b) => b.artifactIds.length - a.artifactIds.length).slice(0, 12);
  if (!keyEntities.length) tagged("DATA INSUFFICIENT", "No entity could be extracted from this extraction.");
  for (const e of keyEntities) {
    if (
      !tagged(
        "FACT",
        `${e.label} (${e.kind}, ${e.id}) — ${e.artifactIds.length} supporting artifact(s) — ${fmtTime(e.firstSeen)} → ${fmtTime(e.lastSeen)}${e.aliases.length ? ` — aliases: ${e.aliases.slice(0, 4).join(", ")}` : ""}`,
      )
    ) {
      truncated();
      break;
    }
  }

  /* ------------------------------ PAGE 2 ------------------------------ */
  newPage("PAGE 2 / 5 — KEY FINDINGS");
  h2("Highest-confidence relationships");
  const topLinks = [...bundle.links].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  if (!topLinks.length) tagged("DATA INSUFFICIENT", "No relationship could be established from the available artifacts.");
  for (const l of topLinks) {
    const v = bundle.verdicts[l.id];
    if (
      !tagged(
        v === "ACCEPT" ? "HUMAN VERIFIED" : "FACT",
        `${nameOf(l.from)} —[${l.type}]— ${nameOf(l.to)} | ${l.status} | ${(l.confidence * 100).toFixed(0)}% | method ${l.method} | evidence ${l.evidenceIds.slice(0, 4).join(", ")}${v ? ` | investigator: ${v}` : ""}`,
      )
    ) {
      truncated();
      break;
    }
  }

  h2("Key timeline events");
  const timed = bundle.artifacts.filter((a) => a.ts !== null).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const picks = timed.length > 10 ? timed.filter((_, i) => i % Math.ceil(timed.length / 10) === 0).slice(0, 10) : timed;
  if (!picks.length) tagged("DATA INSUFFICIENT", "No timestamped artifact is present in this extraction.");
  for (const a of picks) {
    if (!tagged("FACT", `${fmtTime(a.ts)} — ${a.type} — ${a.text.slice(0, 120)} [${a.id}]`)) {
      truncated();
      break;
    }
  }

  h2("UPI / financial highlights");
  if (!bundle.payments.length) {
    tagged(
      "DATA INSUFFICIENT",
      "No payment artifact was found in the available extraction. This does not establish that no payment occurred.",
    );
  } else {
    const pays = [...bundle.payments].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 6);
    for (const p of pays) {
      if (
        !tagged(
          "FACT",
          `${fmtTime(p.ts)} — ${p.amount !== null ? `INR ${p.amount}` : "amount not recorded"} — ${p.vpaFrom ?? "sender not recorded"} → ${p.vpaTo ?? "receiver not recorded"} — txn ${p.txnId ?? "not recorded"} — ${p.app ?? "app not recorded"} [${p.evidenceId}]`,
        )
      ) {
        truncated();
        break;
      }
    }
    const insufficient = bundle.bankCorrelations.filter((b) => b.result === "DATA INSUFFICIENT").length;
    body(
      `Bank correlation performed offline against extraction-internal artifacts only: ${bundle.bankCorrelations.length - insufficient} correlated, ${insufficient} data insufficient. No external bank verification was performed.`,
    );
  }

  /* ------------------------------ PAGE 3 ------------------------------ */
  newPage("PAGE 3 / 5 — INVESTIGATION MAP");
  const map: CanvasMap | undefined =
    (bundle.canvases ?? []).find((c) => c.id === bundle.reportCanvasId) ?? (bundle.canvases ?? [])[0];

  h2("Investigator-created investigation map");
  if (map?.snapshot) {
    body(
      `INVESTIGATOR-CREATED INVESTIGATION MAP — "${map.name}" by ${map.investigator}, ${fmtTime(map.updatedAt)}, case ${map.caseId}. Green connections are evidence-backed; yellow connections are investigator hypotheses and are NOT confirmed evidence; red connections mark contradictions.`,
    );
    const imgW = W - M * 2;
    const imgH = Math.min(250, imgW * 0.5);
    if (room(imgH + 8)) {
      try {
        doc.addImage(map.snapshot, "PNG", M, y, imgW, imgH);
        doc.setDrawColor(60);
        doc.rect(M, y, imgW, imgH);
        y += imgH + 10;
      } catch {
        body("Canvas snapshot could not be embedded; the map definition remains in the local case file.");
      }
    }
    const evEdges = map.edges.filter((e) => e.kind === "EVIDENCE").slice(0, 5);
    for (const e of evEdges) {
      const a = map.nodes.find((n) => n.id === e.from)?.label ?? e.from;
      const b = map.nodes.find((n) => n.id === e.to)?.label ?? e.to;
      tagged(
        "FACT",
        `${a} —[${e.label}]— ${b} | evidence ${e.evidenceIds.slice(0, 4).join(", ") || "none"} | source ${e.source ?? "not recorded"} | ${fmtTime(e.ts)} | confidence ${e.confidence !== null ? `${(e.confidence * 100).toFixed(0)}%` : "not recorded"}`,
      );
    }
    for (const e of map.edges.filter((e) => e.kind === "HYPOTHESIS").slice(0, 4)) {
      const a = map.nodes.find((n) => n.id === e.from)?.label ?? e.from;
      const b = map.nodes.find((n) => n.id === e.to)?.label ?? e.to;
      tagged("INVESTIGATIVE LEAD", `Investigator hypothesis (not evidence): ${a} ↔ ${b} — created by ${e.investigator}.`);
    }
  } else {
    tagged("DATA INSUFFICIENT", "No investigation map has been created and attached for this case.");
  }

  h2("Entity evolution and major leads");
  const evolved = bundle.entities.filter((e) => e.aliases.length > 0).slice(0, 4);
  for (const e of evolved) tagged("FACT", `${e.label} (${e.id}) also appears as: ${e.aliases.slice(0, 6).join(", ")}`);
  if (!evolved.length) body("No alias or identity change was recorded for the extracted entities.");
  for (const an of bundle.anomalies.slice(0, 5)) {
    if (!tagged("INVESTIGATIVE LEAD", `${an.label} — ${an.detail} — evidence ${an.evidenceIds.slice(0, 4).join(", ")}`)) {
      truncated();
      break;
    }
  }

  /* ------------------------------ PAGE 4 ------------------------------ */
  newPage("PAGE 4 / 5 — WARNINGS");
  h2("Contradictions");
  if (!bundle.contradictions.length) body("No contradiction was detected in the available extraction.");
  for (const c of bundle.contradictions.slice(0, 6)) {
    if (
      !tagged(
        "CONTRADICTION",
        `${c.summary} | A: ${c.sideA.label} [${c.sideA.evidenceId}] ${fmtTime(c.sideA.ts)} | B: ${c.sideB.label} [${c.sideB.evidenceId}] ${fmtTime(c.sideB.ts)} — presented without adjudication.`,
      )
    ) {
      truncated();
      break;
    }
  }

  h2("Missing evidence / DATA INSUFFICIENT findings");
  const gaps = bundle.coverage.filter((c) => c.status !== "AVAILABLE");
  if (!gaps.length) body("Every expected evidence category is present in this extraction.");
  for (const c of gaps.slice(0, 12)) {
    if (!tagged("DATA INSUFFICIENT", `${c.type.toUpperCase()} — ${c.status} — ${c.note}`)) {
      truncated();
      break;
    }
  }

  h2("Unverified relationships");
  const unver = bundle.links.filter((l) => l.status !== "CONFIRMED" && !bundle.verdicts[l.id]);
  body(`${unver.length} relationship(s) remain uncertain and unverified by a human investigator.`);
  for (const l of unver.slice(0, 5)) {
    if (
      !tagged(
        "INVESTIGATIVE LEAD",
        `${nameOf(l.from)} ↔ ${nameOf(l.to)} (${l.type}) — ${l.status}, ${(l.confidence * 100).toFixed(0)}% — requires verification.`,
      )
    ) {
      truncated();
      break;
    }
  }

  h2("Limitations");
  body("1. Processing was fully local; no evidence left the workstation and no external service was contacted.");
  body("2. Findings are limited to artifacts present and parsable in this UFDR. Absence is never proof of non-occurrence.");
  body("3. Confidence values are investigative aids derived from linking method and corroboration, not legal determinations.");
  body("4. Anomalies and investigator hypotheses are leads only and are never reported as confirmed facts.");
  body("5. AI text is retrieval-constrained interpretation and must be verified against the cited evidence IDs.");

  /* ------------------------------ PAGE 5 ------------------------------ */
  newPage("PAGE 5 / 5 — AI FINDINGS & HUMAN VERIFICATION");
  h2("Investigator queries and evidence-grounded conclusions");
  if (!bundle.answers.length) body("No AI investigation query was recorded for this case.");
  for (const a of bundle.answers.slice(0, 4)) {
    if (!body(`Q: ${a.question}`)) {
      truncated();
      break;
    }
    tagged(a.status === "DATA INSUFFICIENT" ? "DATA INSUFFICIENT" : "AI INTERPRETATION", a.trace.conclusion || a.answer.slice(0, 400));
    body(`Status ${a.status} · confidence ${(a.confidence * 100).toFixed(0)}% · engine ${a.engine}`, 92);
    body(`Evidence IDs: ${a.evidenceIds.slice(0, 12).join(", ") || "none"}`, 92);
    if (a.missing.length) body(`Not found in extraction: ${a.missing.slice(0, 6).join(", ")}`, 92);
    y += 3;
  }

  h2("Human verification decisions");
  const verdicts = Object.entries(bundle.verdicts);
  if (!verdicts.length) body("No investigator verification decision has been recorded.");
  for (const [linkId, v] of verdicts.slice(0, 10)) {
    const l = bundle.links.find((x) => x.id === linkId);
    if (
      !tagged(
        v === "ACCEPT" ? "HUMAN VERIFIED" : "FACT",
        `${linkId}: ${v}${l ? ` — ${nameOf(l.from)} —[${l.type}]— ${nameOf(l.to)} (${l.status}) — evidence ${l.evidenceIds.slice(0, 3).join(", ")}` : ""}`,
      )
    ) {
      truncated();
      break;
    }
  }

  h2("Investigator activity summary");
  const acts = bundle.activity ?? [];
  const byWho = new Map<string, number>();
  for (const a of acts) byWho.set(a.investigator, (byWho.get(a.investigator) ?? 0) + 1);
  body(
    acts.length
      ? `${acts.length} logged action(s): ${[...byWho.entries()].map(([k, c]) => `${k} ${c}`).join(", ")}. Full log retained locally in the case file.`
      : "No investigator action has been logged for this case.",
  );
  const open = (bundle.openQuestions ?? []).filter((q) => !q.resolved);
  if (open.length) body(`Open questions carried to handoff: ${open.slice(0, 5).map((q) => q.text).join(" | ")}`);

  /* footers */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `NEXORA · ${bundle.id} · package ${bundle.zipSha256.slice(0, 16)} · page ${i}/${pages} · FACT / AI INTERPRETATION / INVESTIGATIVE LEAD / CONTRADICTION / DATA INSUFFICIENT / HUMAN VERIFIED`,
      M,
      H - 22,
    );
  }

  doc.save(`NEXORA_${bundle.id}_summary_report.pdf`);
}
