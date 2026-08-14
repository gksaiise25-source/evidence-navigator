import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { NoCase, PageHead, Panel, Tag, fmt } from "@/components/nexora/Bits";
import { askNexora } from "@/lib/nexora/rag";
import { useNexora } from "@/lib/nexora/store";
import type { SavedAnswer } from "@/lib/nexora/types";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Investigation — NEXORA" },
      {
        name: "description",
        content: "Ask evidence-grounded questions about the case. Every answer cites artifact IDs or returns DATA INSUFFICIENT.",
      },
      { property: "og:title", content: "AI Investigation — NEXORA" },
      { property: "og:description", content: "Evidence-grounded Graph-RAG questioning, fully offline." },
    ],
  }),
  component: AiPage,
});

const SUGGESTED = [
  "Who did the suspect communicate with most often?",
  "Show all payment activity and the counterparties involved",
  "Where was the device between the recorded night hours?",
  "Are there any contradictions in the stated locations?",
];

function AiPage() {
  const { bundle, settings, addAnswer } = useNexora();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [trace, setTrace] = useState<string | null>(null);

  async function ask(question: string) {
    if (!bundle || !question.trim()) return;
    setBusy(true);
    try {
      const res = await askNexora(bundle, question, {
        topK: settings.topK,
        useLlm: settings.useLlm,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
      });
      setAnswers((a) => [res, ...a]);
      await addAnswer(res);
      setQ("");
    } finally {
      setBusy(false);
    }
  }

  if (!bundle) return <NoCase />;

  return (
    <div>
      <PageHead
        title="AI Investigation"
        description="Answers are composed only from retrieved artifacts. If the evidence is insufficient, NEXORA says so instead of guessing."
      />

      <Panel>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask(q);
            }}
            placeholder="Ask a question grounded in this extraction…"
            className="min-w-60 flex-1 rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={busy}
            onClick={() => void ask(q)}
            className="glow rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Reasoning…" : "Investigate"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => void ask(s)} className="mono-xs rounded border border-border px-2 py-1 text-muted-foreground hover:text-primary">
              {s}
            </button>
          ))}
        </div>
        <p className="mono-xs mt-2 text-muted-foreground">
          Reasoning engine: {settings.useLlm ? `local Ollama bridge (${settings.ollamaModel}) with deterministic fallback` : "deterministic evidence composer"}
        </p>
      </Panel>

      <div className="mt-4 space-y-3">
        {answers.map((a) => (
          <Panel key={a.id} title={a.question} subtitle={`${a.engine} · ${fmt(a.createdAt)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={a.status === "ANSWERED" ? "green" : "warn"}>{a.status}</Tag>
              <span className="mono-xs text-muted-foreground">confidence {(a.confidence * 100).toFixed(0)}%</span>
              <button onClick={() => setTrace(trace === a.id ? null : a.id)} className="mono-xs ml-auto rounded border border-border px-2 py-1 hover:text-primary">
                WHY?
              </button>
              <Link to="/graph" className="mono-xs rounded border border-border px-2 py-1 hover:text-primary">
                VIEW GRAPH
              </Link>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{a.answer}</p>
            <p className="mono-xs mt-2 text-cyber-dim">EVIDENCE: {a.evidenceIds.join(", ") || "none"}</p>
            {a.contradictions.length > 0 && (
              <p className="mono-xs mt-1 text-destructive">CONTRADICTIONS: {a.contradictions.join(" | ")}</p>
            )}
            {a.missing.length > 0 && <p className="mono-xs mt-1 text-muted-foreground">NOT FOUND: {a.missing.join(", ")}</p>}
            {trace === a.id && (
              <pre className="mono-xs mt-2 max-h-72 overflow-auto rounded border border-border/60 bg-secondary/30 p-2 whitespace-pre-wrap">
                {JSON.stringify(a.trace, null, 2)}
              </pre>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
