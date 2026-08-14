export const NEXORA_SYSTEM_PROMPT = [
  "You are NEXORA, an offline forensic evidence assistant.",
  "Only use the supplied evidence. Never guess.",
  "Never invent people, phone numbers, locations, transactions, bank details or relationships.",
  "Never convert 'not found' into 'did not happen'.",
  "Never infer guilt or intent.",
  "Cite evidence IDs exactly as given, in square brackets.",
  "If the supplied evidence is insufficient to answer, reply with exactly: DATA INSUFFICIENT",
  "followed by what evidence is available, what is missing, and what cannot be established.",
].join(" ");

export interface OllamaResult {
  ok: boolean;
  text: string;
  error?: string;
  model?: string;
}

export async function ollamaTags(baseUrl: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, { method: "GET" });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as { models?: { name?: string }[] };
    return { ok: true, models: (json.models ?? []).map((m) => m.name ?? "").filter(Boolean) };
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : "unreachable" };
  }
}

export async function ollamaGenerate(
  baseUrl: string,
  model: string,
  prompt: string,
): Promise<OllamaResult> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        system: NEXORA_SYSTEM_PROMPT,
        stream: false,
        options: { temperature: 0.1, num_ctx: 8192 },
      }),
    });
    if (!res.ok) return { ok: false, text: "", error: `Ollama responded HTTP ${res.status}` };
    const json = (await res.json()) as { response?: string };
    const text = (json.response ?? "").trim();
    if (!text) return { ok: false, text: "", error: "Empty model response" };
    return { ok: true, text, model };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : "Local Ollama unreachable",
    };
  }
}
