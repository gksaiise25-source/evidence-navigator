import type { CaseBundle } from "./types";

const DB_NAME = "nexora-forensics";
const STORE = "cases";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const caseDb = {
  list: () => tx<CaseBundle[]>("readonly", (s) => s.getAll()),
  get: (id: string) => tx<CaseBundle | undefined>("readonly", (s) => s.get(id)),
  put: (bundle: CaseBundle) => tx<IDBValidKey>("readwrite", (s) => s.put(bundle)),
  remove: (id: string) => tx<undefined>("readwrite", (s) => s.delete(id)),
};

const ACTIVE_KEY = "nexora.activeCase";
export const activeCaseId = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_KEY)),
  set: (id: string | null) => {
    if (typeof window === "undefined") return;
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  },
};

export interface NexoraSettings {
  investigator: string;
  ollamaUrl: string;
  ollamaModel: string;
  useLlm: boolean;
  topK: number;
  minConfidence: number;
}

const SETTINGS_KEY = "nexora.settings";
export const defaultSettings: NexoraSettings = {
  investigator: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  useLlm: true,
  topK: 12,
  minConfidence: 0.3,
};

export function loadSettings(): NexoraSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: NexoraSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
