import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { activeCaseId, caseDb, loadSettings, saveSettings, defaultSettings, type NexoraSettings } from "./db";
import type {
  ActivityAction,
  ActivityEvent,
  CanvasMap,
  CaseBundle,
  CaseNote,
  OpenQuestion,
  SavedAnswer,
  Verdict,
} from "./types";

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface CaseSummary {
  id: string;
  name: string;
  createdAt: number;
  artifacts: number;
  entities: number;
}

interface Ctx {
  ready: boolean;
  cases: CaseSummary[];
  bundle: CaseBundle | null;
  settings: NexoraSettings;
  updateSettings: (s: NexoraSettings) => void;
  refresh: () => Promise<void>;
  selectCase: (id: string) => Promise<void>;
  saveCase: (b: CaseBundle) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  setVerdict: (linkId: string, v: Verdict | null) => Promise<void>;
  addAnswer: (a: SavedAnswer) => Promise<void>;
  investigator: string;
  logActivity: (action: ActivityAction, detail: string, evidenceIds?: string[]) => Promise<void>;
  addNote: (text: string, evidenceIds?: string[]) => Promise<void>;
  toggleBookmark: (artifactId: string) => Promise<void>;
  addQuestion: (text: string) => Promise<void>;
  toggleQuestion: (id: string) => Promise<void>;
  saveCanvas: (map: CanvasMap) => Promise<void>;
  deleteCanvas: (id: string) => Promise<void>;
  setReportCanvas: (id: string | null) => Promise<void>;
}

const NexoraContext = createContext<Ctx | null>(null);

export function NexoraProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [settings, setSettings] = useState<NexoraSettings>(defaultSettings);

  const refresh = useCallback(async () => {
    const all = await caseDb.list();
    setCases(
      all
        .map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          artifacts: c.artifacts.length,
          entities: c.entities.length,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSettings(loadSettings());
      try {
        const all = await caseDb.list();
        if (cancelled) return;
        setCases(
          all
            .map((c) => ({
              id: c.id,
              name: c.name,
              createdAt: c.createdAt,
              artifacts: c.artifacts.length,
              entities: c.entities.length,
            }))
            .sort((a, b) => b.createdAt - a.createdAt),
        );
        const active = activeCaseId.get();
        const found = all.find((c) => c.id === active) ?? all[0] ?? null;
        setBundle(found);
        if (found) activeCaseId.set(found.id);
      } catch {
        setBundle(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bundleRef = useRef<CaseBundle | null>(null);
  bundleRef.current = bundle;

  const saveCase = useCallback(
    async (b: CaseBundle) => {
      await caseDb.put(b);
      activeCaseId.set(b.id);
      setBundle(b);
      await refresh();
    },
    [refresh],
  );

  const selectCase = useCallback(async (id: string) => {
    const found = await caseDb.get(id);
    if (found) {
      activeCaseId.set(id);
      setBundle(found);
    }
  }, []);

  const deleteCase = useCallback(
    async (id: string) => {
      await caseDb.remove(id);
      const all = await caseDb.list();
      const next = all[0] ?? null;
      setBundle(next);
      activeCaseId.set(next ? next.id : null);
      await refresh();
    },
    [refresh],
  );

  const setVerdict = useCallback(
    async (linkId: string, v: Verdict | null) => {
      if (!bundle) return;
      const verdicts = { ...bundle.verdicts };
      if (v) verdicts[linkId] = v;
      else delete verdicts[linkId];
      const l = bundle.links.find((x) => x.id === linkId);
      const action: ActivityAction =
        v === "ACCEPT" ? "LINK_ACCEPTED" : v === "REJECT" ? "LINK_REJECTED" : v === "REVIEW" ? "LINK_REVIEW" : "VERIFICATION_CLEARED";
      const ev: ActivityEvent = {
        id: rid("ACT"),
        ts: Date.now(),
        investigator: settings.investigator?.trim() || bundle.investigator,
        action,
        detail: `${linkId}${l ? ` (${l.type}, ${l.status}, confidence ${(l.confidence * 100).toFixed(0)}%)` : ""} → ${v ?? "CLEARED"}`,
        evidenceIds: l?.evidenceIds ?? [],
      };
      await saveCase({ ...bundle, verdicts, activity: [ev, ...(bundle.activity ?? [])].slice(0, 500) });
    },
    [bundle, saveCase, settings.investigator],
  );

  const addAnswer = useCallback(
    async (a: SavedAnswer) => {
      if (!bundle) return;
      await saveCase({ ...bundle, answers: [a, ...bundle.answers].slice(0, 60) });
    },
    [bundle, saveCase],
  );

  const investigator = settings.investigator?.trim() || bundle?.investigator || "Unassigned investigator";

  const patch = useCallback(
    async (fn: (b: CaseBundle) => CaseBundle) => {
      const current = bundleRef.current;
      if (!current) return;
      const next = fn(current);
      bundleRef.current = next;
      await saveCase(next);
    },
    [saveCase],
  );

  const logActivity = useCallback(
    async (action: ActivityAction, detail: string, evidenceIds: string[] = []) => {
      const ev: ActivityEvent = {
        id: rid("ACT"),
        ts: Date.now(),
        investigator,
        action,
        detail,
        evidenceIds,
      };
      await patch((b) => ({ ...b, activity: [ev, ...(b.activity ?? [])].slice(0, 500) }));
    },
    [patch, investigator],
  );

  const addNote = useCallback(
    async (text: string, evidenceIds: string[] = []) => {
      if (!text.trim()) return;
      const note: CaseNote = { id: rid("NOTE"), investigator, ts: Date.now(), text: text.trim(), evidenceIds };
      const ev: ActivityEvent = {
        id: rid("ACT"),
        ts: Date.now(),
        investigator,
        action: "NOTE_ADDED",
        detail: text.trim().slice(0, 160),
        evidenceIds,
      };
      await patch((b) => ({
        ...b,
        notes: [note, ...(b.notes ?? [])],
        activity: [ev, ...(b.activity ?? [])].slice(0, 500),
      }));
    },
    [patch, investigator],
  );

  const toggleBookmark = useCallback(
    async (artifactId: string) => {
      const cur = bundleRef.current;
      if (!cur) return;
      const has = (cur.bookmarks ?? []).includes(artifactId);
      const ev: ActivityEvent = {
        id: rid("ACT"),
        ts: Date.now(),
        investigator,
        action: "EVIDENCE_BOOKMARKED",
        detail: has ? `Bookmark removed from ${artifactId}` : `Bookmarked ${artifactId}`,
        evidenceIds: [artifactId],
      };
      await patch((b) => ({
        ...b,
        bookmarks: has ? (b.bookmarks ?? []).filter((x) => x !== artifactId) : [artifactId, ...(b.bookmarks ?? [])],
        activity: [ev, ...(b.activity ?? [])].slice(0, 500),
      }));
    },
    [patch, investigator],
  );

  const addQuestion = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const q: OpenQuestion = { id: rid("Q"), investigator, ts: Date.now(), text: text.trim(), resolved: false };
      await patch((b) => ({ ...b, openQuestions: [q, ...(b.openQuestions ?? [])] }));
      await logActivity("HANDOFF_UPDATED", `Open question added: ${text.trim().slice(0, 140)}`);
    },
    [patch, investigator, logActivity],
  );

  const toggleQuestion = useCallback(
    async (id: string) => {
      await patch((b) => ({
        ...b,
        openQuestions: (b.openQuestions ?? []).map((q) => (q.id === id ? { ...q, resolved: !q.resolved } : q)),
      }));
      await logActivity("HANDOFF_UPDATED", `Open question status changed (${id})`);
    },
    [patch, logActivity],
  );

  const saveCanvas = useCallback(
    async (map: CanvasMap) => {
      await patch((b) => {
        const rest = (b.canvases ?? []).filter((c) => c.id !== map.id);
        return { ...b, canvases: [{ ...map, updatedAt: Date.now() }, ...rest] };
      });
      await logActivity(
        "CANVAS_SAVED",
        `Investigation map "${map.name}" saved — ${map.nodes.length} point(s), ${map.edges.length} connection(s), ${map.strokes.length} annotation stroke(s)`,
        map.nodes.flatMap((n) => n.evidenceIds).slice(0, 25),
      );
    },
    [patch, logActivity],
  );

  const deleteCanvas = useCallback(
    async (id: string) => {
      await patch((b) => ({
        ...b,
        canvases: (b.canvases ?? []).filter((c) => c.id !== id),
        reportCanvasId: b.reportCanvasId === id ? null : b.reportCanvasId,
      }));
      await logActivity("CANVAS_CLEARED", `Investigation map ${id} deleted`);
    },
    [patch, logActivity],
  );

  const setReportCanvas = useCallback(
    async (id: string | null) => {
      await patch((b) => ({ ...b, reportCanvasId: id }));
      await logActivity("CANVAS_ATTACHED", id ? `Investigation map ${id} attached to forensic report` : "Investigation map detached from report");
    },
    [patch, logActivity],
  );

  const updateSettings = useCallback((s: NexoraSettings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      cases,
      bundle,
      settings,
      updateSettings,
      refresh,
      selectCase,
      saveCase,
      deleteCase,
      setVerdict,
      addAnswer,
      investigator,
      logActivity,
      addNote,
      toggleBookmark,
      addQuestion,
      toggleQuestion,
      saveCanvas,
      deleteCanvas,
      setReportCanvas,
    }),
    [
      ready,
      cases,
      bundle,
      settings,
      updateSettings,
      refresh,
      selectCase,
      saveCase,
      deleteCase,
      setVerdict,
      addAnswer,
      investigator,
      logActivity,
      addNote,
      toggleBookmark,
      addQuestion,
      toggleQuestion,
      saveCanvas,
      deleteCanvas,
      setReportCanvas,
    ],
  );

  return <NexoraContext.Provider value={value}>{children}</NexoraContext.Provider>;
}

export function useNexora(): Ctx {
  const ctx = useContext(NexoraContext);
  if (!ctx) throw new Error("useNexora must be used inside NexoraProvider");
  return ctx;
}
