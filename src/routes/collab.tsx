import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AvailabilityPill, Insufficient, NoCase, PageHead, Panel, StatusPill, Tag, fmt } from "@/components/nexora/Bits";
import { useNexora } from "@/lib/nexora/store";
import { ARTIFACT_LABELS } from "@/lib/nexora/types";

export const Route = createFileRoute("/collab")({
  head: () => ({
    meta: [
      { title: "Collaboration & Handoff — NEXORA" },
      {
        name: "description",
        content: "Local investigator activity log, shared notes and a case handoff brief covering completed work, pending work and open questions.",
      },
      { property: "og:title", content: "Collaboration & Handoff — NEXORA" },
      { property: "og:description", content: "Multi-investigator activity log and case handoff brief, stored locally." },
    ],
  }),
  component: CollabPage,
});

function CollabPage() {
  const { bundle, investigator, addNote, addQuestion, toggleQuestion, toggleBookmark } = useNexora();
  const [note, setNote] = useState("");
  const [evi, setEvi] = useState("");
  const [question, setQuestion] = useState("");
  const [who, setWho] = useState("all");

  const activity = useMemo(() => bundle?.activity ?? [], [bundle]);
  const people = useMemo(() => [...new Set(activity.map((a) => a.investigator))], [activity]);
  const shown = who === "all" ? activity : activity.filter((a) => a.investigator === who);

  if (!bundle) return <NoCase />;

  const verdicts = Object.entries(bundle.verdicts);
  const uncertain = bundle.links.filter((l) => l.status !== "CONFIRMED" && !bundle.verdicts[l.id]);
  const missing = bundle.coverage.filter((c) => c.status !== "AVAILABLE");
  const bookmarks = bundle.bookmarks ?? [];
  const notes = bundle.notes ?? [];
  const questions = bundle.openQuestions ?? [];
  const topLinks = [...bundle.links].sort((a, b) => b.confidence - a.confidence).slice(0, 6);

  return (
    <div>
      <PageHead
        title="Collaborative Investigation"
        description={`Every action below is recorded locally against an investigator ID. Acting as: ${investigator}. Original evidence is immutable — the log, notes and verifications are separate overlays.`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Case handoff brief" subtitle="What is done, what is pending, what must be checked next">
          <div className="space-y-4 text-sm">
            <section>
              <p className="mono-xs text-primary uppercase">Completed investigation</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>UFDR ingested and hashed · {bundle.files.length} artifact file(s), {bundle.artifacts.length} artifacts</li>
                <li>{bundle.entities.length} entities and {bundle.links.length} relationships extracted</li>
                <li>{verdicts.length} relationship(s) human-verified</li>
                <li>{bundle.answers.length} AI investigation query/queries recorded</li>
                <li>{(bundle.canvases ?? []).length} investigation map(s) built</li>
                <li>{activity.filter((a) => a.action === "REPORT_GENERATED").length} report(s) generated</li>
              </ul>
            </section>
            <section>
              <p className="mono-xs text-warn uppercase">Pending investigation</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{uncertain.length} uncertain relationship(s) awaiting human verification</li>
                <li>{bundle.contradictions.length} contradiction(s) not yet adjudicated</li>
                <li>{missing.length} evidence category/categories not available in this extraction</li>
                <li>{questions.filter((q) => !q.resolved).length} open question(s)</li>
              </ul>
            </section>
            <section>
              <p className="mono-xs text-primary uppercase">Important findings</p>
              {!bookmarks.length && !notes.length && !topLinks.length && (
                <p className="mono-xs text-muted-foreground">Nothing flagged yet.</p>
              )}
              <ul className="mt-1 space-y-0.5">
                {topLinks.map((l) => (
                  <li key={l.id} className="mono-xs text-muted-foreground">
                    {l.id} · {l.type} · {(l.confidence * 100).toFixed(0)}% <StatusPill status={l.status} /> evidence {l.evidenceIds.slice(0, 3).join(", ")}
                  </li>
                ))}
                {bookmarks.slice(0, 8).map((id) => (
                  <li key={id} className="mono-xs text-muted-foreground">bookmarked evidence {id}</li>
                ))}
              </ul>
            </section>
            <section>
              <p className="mono-xs text-destructive uppercase">Contradictions</p>
              {!bundle.contradictions.length ? (
                <p className="mono-xs text-muted-foreground">None detected in the available extraction.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {bundle.contradictions.slice(0, 6).map((c) => (
                    <li key={c.id} className="mono-xs text-muted-foreground">{c.id} · {c.summary}</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <p className="mono-xs text-warn uppercase">Missing evidence</p>
              {!missing.length ? (
                <p className="mono-xs text-muted-foreground">All expected categories present.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {missing.map((c) => (
                    <li key={c.type} className="mono-xs flex items-center gap-2 text-muted-foreground">
                      <AvailabilityPill status={c.status} /> {ARTIFACT_LABELS[c.type]}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Open questions for the next investigator">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Verify whether the UPI VPA belongs to the contact"
                className="min-w-40 flex-1 rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => {
                  void addQuestion(question);
                  setQuestion("");
                }}
                className="glow rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Add
              </button>
            </div>
            <ul className="mt-3 space-y-1">
              {questions.map((q) => (
                <li key={q.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={q.resolved} onChange={() => void toggleQuestion(q.id)} className="mt-1" />
                  <span className={q.resolved ? "text-muted-foreground line-through" : ""}>
                    {q.text}
                    <span className="mono-xs ml-2 text-muted-foreground">{q.investigator} · {fmt(q.ts)}</span>
                  </span>
                </li>
              ))}
              {!questions.length && <p className="mono-xs text-muted-foreground">No open question recorded.</p>}
            </ul>
          </Panel>

          <Panel title="Investigator notes" subtitle="Notes are annotations — they never modify the artifact records">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Observation, reasoning or instruction for the next investigator…"
              className="w-full rounded border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={evi}
                onChange={(e) => setEvi(e.target.value)}
                placeholder="Related evidence IDs (comma separated, optional)"
                className="min-w-40 flex-1 rounded border border-input bg-input/40 px-3 py-1.5 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={() => {
                  void addNote(
                    note,
                    evi.split(",").map((x) => x.trim()).filter(Boolean),
                  );
                  setNote("");
                  setEvi("");
                  toast.success("Note recorded in the activity log");
                }}
                className="rounded border border-primary/50 px-3 py-1.5 text-xs text-primary"
              >
                Add note
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {notes.slice(0, 12).map((n) => (
                <div key={n.id} className="rounded border border-border/60 bg-secondary/30 p-2 text-sm">
                  <p className="mono-xs text-muted-foreground">{n.investigator} · {fmt(n.ts)}</p>
                  <p className="mt-1">{n.text}</p>
                  {n.evidenceIds.length > 0 && <p className="mono-xs mt-1 text-cyber-dim">EVIDENCE: {n.evidenceIds.join(", ")}</p>}
                </div>
              ))}
              {!notes.length && <p className="mono-xs text-muted-foreground">No note recorded yet.</p>}
            </div>
          </Panel>

          <Panel title="Bookmarked evidence">
            {!bookmarks.length ? (
              <Insufficient what="No evidence has been bookmarked for this case yet." missing="Bookmark artifacts from the Evidence Explorer." />
            ) : (
              <ul className="space-y-1">
                {bookmarks.map((id) => {
                  const a = bundle.artifacts.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-start gap-2 text-sm">
                      <button onClick={() => void toggleBookmark(id)} className="mono-xs rounded border border-border px-1 hover:text-destructive">
                        REMOVE
                      </button>
                      <span>
                        <span className="mono-xs text-primary">{id}</span>{" "}
                        {a ? `${ARTIFACT_LABELS[a.type]} · ${fmt(a.ts)} · ${a.text.slice(0, 90)}` : "artifact not found in this case"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-4"
        title="Investigator activity log"
        subtitle="Local, append-only record of who did what and when"
        actions={
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded border border-input bg-input/40 px-2 py-1 text-xs">
            <option value="all">All investigators ({activity.length})</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        }
      >
        {!shown.length ? (
          <p className="text-sm text-muted-foreground">
            No activity recorded yet. Queries, verifications, notes, bookmarks, canvas saves and report generation are logged automatically.
          </p>
        ) : (
          <div className="space-y-1">
            {shown.slice(0, 200).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-border/50 bg-secondary/20 px-2 py-1.5 text-sm">
                <span className="mono-xs text-muted-foreground">{fmt(a.ts)}</span>
                <Tag tone={a.action === "LINK_REJECTED" ? "red" : a.action === "LINK_ACCEPTED" ? "green" : "muted"}>{a.action}</Tag>
                <span className="mono-xs text-primary">{a.investigator}</span>
                <span className="min-w-40 flex-1 break-words">{a.detail}</span>
                {a.evidenceIds.length > 0 && <span className="mono-xs text-cyber-dim">{a.evidenceIds.slice(0, 5).join(", ")}</span>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
