import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { activeCaseId, caseDb, loadSettings, saveSettings, defaultSettings, type NexoraSettings } from "./db";
import type { CaseBundle, SavedAnswer, Verdict } from "./types";

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
      await saveCase({ ...bundle, verdicts });
    },
    [bundle, saveCase],
  );

  const addAnswer = useCallback(
    async (a: SavedAnswer) => {
      if (!bundle) return;
      await saveCase({ ...bundle, answers: [a, ...bundle.answers].slice(0, 60) });
    },
    [bundle, saveCase],
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
    }),
    [ready, cases, bundle, settings, updateSettings, refresh, selectCase, saveCase, deleteCase, setVerdict, addAnswer],
  );

  return <NexoraContext.Provider value={value}>{children}</NexoraContext.Provider>;
}

export function useNexora(): Ctx {
  const ctx = useContext(NexoraContext);
  if (!ctx) throw new Error("useNexora must be used inside NexoraProvider");
  return ctx;
}
