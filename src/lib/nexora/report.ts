import { jsPDF } from "jspdf";
import { fmtTime } from "./rag";
import type { CaseBundle } from "./types";

type Tag = "FACT" | "AI INTERPRETATION" | "INVESTIGATIVE LEAD" | "CONTRADICTION" | "DATA INSUFFICIENT" | "HUMAN VERIFIED";

export function generateReport(bundle: CaseBundle): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const ensure = (needed = 24) => {
    if (y + needed > H - M) {
      doc.addPage();
      y = M;
    }
  };

  const h1 = (t: string) => {
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(10, 90, 60);
    doc.text(t, M, y);
    y += 6;
    doc.setDrawColor(10, 130, 90);
    doc.line(M, y, W - M, y);
    y += 16;
    doc.setTextColor(20);
  };

  const body = (t: string, indent = 0) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(t, W - M * 2 - indent);
    for (const line of lines) {
      ensure(14);
      doc.text(line, M + indent, y);
      y += 12;
    }
  };

  const tagged = (tag: Tag, t: string) => {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`[${tag}]`, M, y);
    doc.setTextColor(20);
    body(t, 96 - 48 + 48);
    y += 2;
  };

  // Cover
  doc.setFillColor(8, 12, 11);
  doc.rect(0, 0, W, 150, "F");
  doc.setTextColor(80, 240, 170);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("NEXORA", M, 70);
  doc.setFontSize(11);
  doc.setTextColor(200, 255, 230);
  doc.text("Offline AI UFDR Forensic Investigation Report", M, 92);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toISOString().slice(0, 19)}Z — local processing only`, M, 112);
  doc.setTextColor(20);
  y = 180;

  h1("1. Case Information");
  body(`Case ID: ${bundle.id}`);
  body(`Case name: ${bundle.name}`);
  body(`Investigator: ${bundle.investigator}`);
  body(`Created: ${fmtTime(bundle.createdAt)}`);
  body(`UFDR package: ${bundle.zipName}`);
  body(`Package SHA-256: ${bundle.zipSha256}`);
  body(
    `Ground-truth file: ${bundle.groundTruthFile ?? "none"} (excluded from investigative evidence; testing/evaluation only)`,
  );

  h1("2. Available Artifacts & Integrity Hashes");
  for (const f of bundle.files) {
    body(`${f.name} — ${f.type} — ${f.rows} rows — ${(f.size / 1024).toFixed(1)} KB`);
    body(`SHA-256: ${f.sha256}`, 12);
  }

  h1("3. Evidence Coverage / Missing Data");
  for (const c of bundle.coverage) {
    const tag: Tag = c.status === "AVAILABLE" ? "FACT" : "DATA INSUFFICIENT";
    tagged(tag, `${c.type.toUpperCase()} — ${c.status} — ${c.note}`);
  }

  h1("4. Entities");
  for (const e of bundle.entities.slice(0, 120)) {
    tagged(
      "FACT",
      `${e.id} — ${e.kind} — ${e.label}${e.aliases.length ? ` (aliases: ${e.aliases.join(", ")})` : ""} — ${e.artifactIds.length} supporting artifacts — first seen ${fmtTime(e.firstSeen)}, last seen ${fmtTime(e.lastSeen)}`,
    );
  }
  if (bundle.entities.length > 120) body(`… ${bundle.entities.length - 120} further entities in the case file.`);

  h1("5. Entity Evolution / Identity History");
  const nameOf = (id: string) => bundle.entities.find((e) => e.id === id)?.label ?? id;
  for (const e of bundle.entities.filter((x) => x.kind === "person").slice(0, 25)) {
    const rel = bundle.links.filter((l) => l.from === e.id || l.to === e.id);
    body(`${e.label} (${e.id})`);
    body(
      `Aliases: ${e.aliases.join(", ") || "none recorded"} | Linked identifiers: ${
        rel
          .slice(0, 12)
          .map((l) => `${nameOf(l.from === e.id ? l.to : l.from)} [${l.status}]`)
          .join(", ") || "none"
      }`,
      12,
    );
  }

  h1("6. Cross-Modal Links & Knowledge Graph Summary");
  body(
    `Graph: ${bundle.entities.length} nodes, ${bundle.links.length} evidence-backed relationships. Status distribution: ${
      (["CONFIRMED", "PROBABLE", "POSSIBLE", "UNVERIFIED"] as const)
        .map((s) => `${s} ${bundle.links.filter((l) => l.status === s).length}`)
        .join(", ")
    }.`,
  );
  for (const l of bundle.links.slice(0, 120)) {
    const verdict = bundle.verdicts[l.id];
    tagged(
      verdict === "ACCEPT" ? "HUMAN VERIFIED" : "FACT",
      `${l.id}: ${nameOf(l.from)} —[${l.type}]— ${nameOf(l.to)} | ${l.status} | confidence ${(l.confidence * 100).toFixed(0)}% | method: ${l.method} | evidence: ${l.evidenceIds.join(", ")}${verdict ? ` | investigator decision: ${verdict}` : ""}`,
    );
  }

  h1("7. Timeline");
  for (const a of bundle.artifacts.filter((x) => x.ts !== null).slice(0, 200)) {
    body(`${fmtTime(a.ts)} — ${a.type} — ${a.text.slice(0, 150)} [${a.id}]`);
  }

  h1("8. Anomalies (Investigative Leads Only)");
  if (!bundle.anomalies.length) body("No anomaly signals were produced from the available extraction.");
  for (const an of bundle.anomalies) {
    tagged("INVESTIGATIVE LEAD", `${an.id}: ${an.label} — ${an.detail} — evidence: ${an.evidenceIds.join(", ")}`);
  }

  h1("9. UPI / Financial Artifacts");
  if (!bundle.payments.length) {
    tagged(
      "DATA INSUFFICIENT",
      "No relevant payment artifact was found in the available extraction. This does not establish that no payment occurred.",
    );
  }
  for (const p of bundle.payments.slice(0, 100)) {
    tagged(
      "FACT",
      `${p.evidenceId} — ${fmtTime(p.ts)} — amount ${p.amount !== null ? `INR ${p.amount}` : "not recorded"} | txn ${p.txnId ?? "not recorded"} | from ${p.vpaFrom ?? "not recorded"} | to ${p.vpaTo ?? "not recorded"} | merchant ${p.merchant ?? "not recorded"} | bank ${p.bank ?? "not recorded"} | IFSC ${p.ifsc ?? "not recorded"} | app ${p.app ?? "not recorded"}`,
    );
  }

  h1("10. Bank Detail Correlation (Offline, Extraction-Internal)");
  body(
    "No live or external bank verification is performed. Results below compare bank identifiers only against other artifacts inside this UFDR.",
  );
  for (const b of bundle.bankCorrelations) {
    tagged(b.result === "DATA INSUFFICIENT" ? "DATA INSUFFICIENT" : "FACT", `${b.subject}: ${b.result} — ${b.detail} — evidence: ${b.evidenceIds.join(", ")}`);
  }

  h1("11. Contradictions");
  if (!bundle.contradictions.length) body("No contradictions were detected in the available extraction.");
  for (const c of bundle.contradictions) {
    tagged(
      "CONTRADICTION",
      `${c.id} (${c.kind}): ${c.summary} | A: ${c.sideA.label} [${c.sideA.evidenceId}] ${fmtTime(c.sideA.ts)} — ${c.sideA.detail} | B: ${c.sideB.label} [${c.sideB.evidenceId}] ${fmtTime(c.sideB.ts)} — ${c.sideB.detail}`,
    );
  }

  h1("12. AI Answers & Evidence Reasoning Trace");
  if (!bundle.answers.length) body("No AI investigation queries were saved for this case.");
  for (const a of bundle.answers) {
    body(`Q: ${a.question}`);
    tagged(
      a.status === "DATA INSUFFICIENT" ? "DATA INSUFFICIENT" : "AI INTERPRETATION",
      `${a.answer.slice(0, 2000)}`,
    );
    body(
      `Status: ${a.status} | Confidence: ${(a.confidence * 100).toFixed(0)}% | Engine: ${a.engine}`,
      12,
    );
    body(`Evidence IDs: ${a.evidenceIds.join(", ") || "none"}`, 12);
    body(`Sources: ${a.sources.join(", ") || "none"}`, 12);
    body("Evidence Reasoning Trace:", 12);
    body(`Retrieved: ${a.trace.retrieved.join("; ") || "none"}`, 24);
    body(`Entities: ${a.trace.entities.join("; ") || "none"}`, 24);
    body(`Relationships: ${a.trace.relationships.join("; ") || "none"}`, 24);
    body(`Timeline: ${a.trace.timeline.join("; ") || "none"}`, 24);
    body(`Contradictions: ${a.trace.contradictions.join("; ") || "none"}`, 24);
    body(`Missing evidence: ${a.trace.missing.join("; ")}`, 24);
    body(`Confidence signals: ${a.trace.confidenceSignals.join("; ")}`, 24);
    body(`Conclusion: ${a.trace.conclusion}`, 24);
    y += 6;
  }

  h1("13. Human Verification Record");
  const verdictEntries = Object.entries(bundle.verdicts);
  if (!verdictEntries.length) body("No investigator decisions have been recorded for uncertain links.");
  for (const [linkId, v] of verdictEntries) {
    const l = bundle.links.find((x) => x.id === linkId);
    tagged(
      v === "ACCEPT" ? "HUMAN VERIFIED" : "FACT",
      `${linkId}: ${v}${l ? ` — ${nameOf(l.from)} —[${l.type}]— ${nameOf(l.to)} (${l.status})` : ""}`,
    );
  }

  h1("14. Limitations");
  body(
    "1. All processing was performed locally; no evidence left the examiner workstation and no external service was contacted.",
  );
  body(
    "2. Findings are limited to artifacts present and parsable in this UFDR. Absence of an artifact is never treated as proof that an event did not occur.",
  );
  body(
    "3. Relationship confidence values are derived from linking method and corroboration count; they are investigative aids, not legal determinations.",
  );
  body("4. Anomalies are investigative leads only. Contradictions are presented without adjudication.");
  body("5. AI-generated text is retrieval-constrained interpretation and must be verified against cited evidence IDs.");
  body(
    "6. Any supplied ground-truth dataset was used only for testing/evaluation and never as investigator evidence.",
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`NEXORA — ${bundle.id} — ${bundle.zipSha256.slice(0, 16)} — page ${i}/${pages}`, M, H - 24);
  }

  doc.save(`NEXORA_${bundle.id}_report.pdf`);
}
