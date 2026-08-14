import { ACCT_RE, IFSC_RE, TXN_RE, UPI_RE } from "./parse";
import type { Artifact, BankCorrelation, PaymentRecord } from "./types";

function firstMatch(text: string, re: RegExp, group = 0): string | null {
  const rx = new RegExp(re.source, re.flags.replace("g", ""));
  const m = text.match(rx);
  if (!m) return null;
  return m[group] ?? m[0] ?? null;
}

function amountOf(text: string): number | null {
  const rx = /(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s?(?:rs|inr|rupees)\b/i;
  const m = text.match(rx);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const BANK_RE =
  /\b(HDFC|ICICI|SBI|Axis|Kotak|Yes Bank|IDFC|PNB|Canara|Union Bank|Bank of Baroda|IndusInd|Federal Bank)\b/i;
const MERCHANT_RE = /(?:paid to|to|credited by|received from)\s+([A-Z][\w&.' -]{2,30})/;
const APP_RE = /\b(GPay|Google Pay|PhonePe|Paytm|BHIM|Amazon Pay|CRED|Mobikwik|WhatsApp Pay)\b/i;

export function extractPayments(artifacts: Artifact[]): PaymentRecord[] {
  const out: PaymentRecord[] = [];
  for (const a of artifacts) {
    const text = `${a.text} ${Object.values(a.raw).join(" ")}`;
    const isFinancial =
      a.type === "payment" ||
      /upi|debited|credited|txn|transaction|utr|vpa|imps|neft|paid to/i.test(text);
    if (!isFinancial) continue;
    const vpas = [...new Set([...text.matchAll(new RegExp(UPI_RE.source, "gi"))].map((m) => m[0]))];
    const txn = firstMatch(text, TXN_RE, 1);
    const amount = amountOf(text);
    if (!vpas.length && !txn && amount === null && a.type !== "payment") continue;
    out.push({
      evidenceId: a.id,
      ts: a.ts,
      amount,
      currency: "INR",
      txnId: txn,
      vpaFrom: vpas[0] ?? null,
      vpaTo: vpas[1] ?? null,
      merchant: firstMatch(text, MERCHANT_RE, 1),
      bank: firstMatch(text, BANK_RE),
      ifsc: firstMatch(text, IFSC_RE),
      accountRef: firstMatch(text, ACCT_RE),
      app: a.app ?? firstMatch(text, APP_RE),
      rawText: a.text.slice(0, 400),
    });
  }
  return out.sort((x, y) => (x.ts ?? 0) - (y.ts ?? 0));
}

/** Offline "Bank Detail Correlation" — compares bank identifiers only against
 *  other artifacts inside the same extraction. No live/external verification. */
export function correlateBankDetails(payments: PaymentRecord[]): BankCorrelation[] {
  const out: BankCorrelation[] = [];
  const byAccount = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const key = p.accountRef ?? p.vpaFrom ?? p.ifsc;
    if (!key) continue;
    const arr = byAccount.get(key) ?? [];
    arr.push(p);
    byAccount.set(key, arr);
  }
  let seq = 0;
  for (const [key, group] of byAccount) {
    seq += 1;
    const banks = [...new Set(group.map((g) => g.bank?.toUpperCase()).filter(Boolean))] as string[];
    const ifscs = [...new Set(group.map((g) => g.ifsc).filter(Boolean))] as string[];
    const evidenceIds = group.map((g) => g.evidenceId);
    if (banks.length > 1 || ifscs.length > 1) {
      out.push({
        id: `BC-${seq}`,
        subject: key,
        result: "POTENTIAL MISMATCH",
        detail: `Identifier appears with differing bank/IFSC values inside the extraction: ${[
          ...banks,
          ...ifscs,
        ].join(", ")}. Requires investigator review; no automatic determination is made.`,
        evidenceIds,
      });
    } else if (banks.length === 1 && group.length > 1) {
      out.push({
        id: `BC-${seq}`,
        subject: key,
        result: "CORRELATED",
        detail: `Identifier consistently associated with ${banks[0]} across ${group.length} artifacts in the available extraction.`,
        evidenceIds,
      });
    } else {
      out.push({
        id: `BC-${seq}`,
        subject: key,
        result: "DATA INSUFFICIENT",
        detail:
          "Only a single artifact references this identifier and no corroborating bank/IFSC data was found in the available extraction. Correlation cannot be established.",
        evidenceIds,
      });
    }
  }
  return out;
}
