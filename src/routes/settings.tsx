import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHead, Panel, Tag } from "@/components/nexora/Bits";
import { ollamaTags } from "@/lib/nexora/ollama";
import { useNexora } from "@/lib/nexora/store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — NEXORA" },
      { name: "description", content: "Configure the local Ollama reasoning bridge, retrieval depth and confidence thresholds." },
      { property: "og:title", content: "Settings — NEXORA" },
      { property: "og:description", content: "Local Ollama bridge and retrieval configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings } = useNexora();
  const [status, setStatus] = useState<string>("unknown");

  async function test() {
    const r = await ollamaTags(settings.ollamaUrl);
    setStatus(r.ok ? `online — models: ${r.models.join(", ") || "none installed"}` : `offline — ${r.error ?? "no response"}`);
    if (r.ok) toast.success("Local Ollama bridge reachable");
    else toast.error("Ollama not reachable — deterministic engine will be used");
  }

  return (
    <div>
      <PageHead title="Settings" description="NEXORA never contacts a cloud service. The only optional network call is to your own machine's Ollama instance." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Local reasoning bridge">
          <label className="block text-sm">
            <span className="mono-xs text-muted-foreground">OLLAMA URL</span>
            <input value={settings.ollamaUrl} onChange={(e) => updateSettings({ ...settings, ollamaUrl: e.target.value })} className="mt-1 w-full rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mono-xs text-muted-foreground">MODEL</span>
            <input value={settings.ollamaModel} onChange={(e) => updateSettings({ ...settings, ollamaModel: e.target.value })} className="mt-1 w-full rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.useLlm} onChange={(e) => updateSettings({ ...settings, useLlm: e.target.checked })} />
            Use local LLM for narrative composition (evidence grounding is enforced either way)
          </label>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => void test()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Test connection</button>
            <Tag tone={status.startsWith("online") ? "green" : "warn"}>{status}</Tag>
          </div>
        </Panel>

        <Panel title="Retrieval">
          <label className="block text-sm">
            <span className="mono-xs text-muted-foreground">TOP-K EVIDENCE PER QUESTION ({settings.topK})</span>
            <input type="range" min={4} max={40} value={settings.topK} onChange={(e) => updateSettings({ ...settings, topK: Number(e.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mono-xs text-muted-foreground">MINIMUM LINK CONFIDENCE ({settings.minConfidence.toFixed(2)})</span>
            <input type="range" min={0} max={1} step={0.05} value={settings.minConfidence} onChange={(e) => updateSettings({ ...settings, minConfidence: Number(e.target.value) })} className="mt-1 w-full" />
          </label>
          <p className="mono-xs mt-3 text-muted-foreground">
            All case data stays in this browser's IndexedDB. Clearing browser storage destroys the local case copy.
          </p>
        </Panel>
      </div>
    </div>
  );
}
