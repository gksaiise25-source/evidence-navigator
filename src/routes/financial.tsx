import { createFileRoute } from "@tanstack/react-router";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/financial")({
  head: () => ({
    meta: [
      { title: "Financial Intelligence — NEXORA" },
      { name: "description", content: "UPI and payment artifacts with local bank-detail correlation." },
      { property: "og:title", content: "Financial Intelligence — NEXORA" },
      { property: "og:description", content: "UPI and payment artifacts with local bank-detail correlation." },
    ],
  }),
  component: FinancialPage,
});

function FinancialPage() {
  const { bundle } = useNexora();
  if (!bundle) return <NoCase />;
  return (
    <div>
      <PageHead title="Financial Intelligence" description="Payment records parsed from the extraction. Correlation is computed locally between identifiers present in the evidence." />
      <Panel title={`Payments (${bundle.payments.length})`}>
        {bundle.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">DATA INSUFFICIENT — no payment artifact present in this extraction.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="mono-xs text-muted-foreground">
                <tr><th className="py-1 pr-3">TIME</th><th className="py-1 pr-3">AMOUNT</th><th className="py-1 pr-3">VPA / COUNTERPARTY</th><th className="py-1 pr-3">TXN ID</th><th className="py-1 pr-3">EVIDENCE</th></tr>
              </thead>
              <tbody>
                {bundle.payments.map((p) => (
                  <tr key={p.evidenceId} className="border-t border-border/50">
                    <td className="mono-xs py-1.5 pr-3">{fmt(p.ts)}</td>
                    <td className="mono-xs py-1.5 pr-3">{p.amount === null ? "unrecorded" : p.amount}</td>
                    <td className="mono-xs py-1.5 pr-3">{p.vpaTo ?? p.vpaFrom ?? p.merchant ?? "unrecorded"}</td>
                    <td className="mono-xs py-1.5 pr-3">{p.txnId ?? "unrecorded"}</td>
                    <td className="mono-xs py-1.5 pr-3 text-cyber-dim">{p.evidenceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel className="mt-4" title={`Bank detail correlation (${bundle.bankCorrelations.length})`} subtitle="Identifier overlap inside the extraction — no external bank lookup">
        {bundle.bankCorrelations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No correlation is supported by the available financial evidence.</p>
        ) : (
          <ul className="space-y-2">
            {bundle.bankCorrelations.map((c) => (
              <li key={c.id} className="rounded border border-border/60 p-2">
                <p className="text-sm">{c.subject} — {c.result}</p>
                <p className="mono-xs mt-1 text-muted-foreground">{c.detail}</p>
                <p className="mono-xs mt-1 text-cyber-dim">{c.evidenceIds.join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
