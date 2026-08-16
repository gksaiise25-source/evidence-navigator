export type ArtifactType =
  | "call"
  | "contact"
  | "sms"
  | "chat"
  | "gps"
  | "browser"
  | "app_usage"
  | "notification"
  | "account"
  | "file"
  | "wifi"
  | "bluetooth"
  | "device_event"
  | "device_info"
  | "manifest"
  | "payment"
  | "media"
  | "unknown";

export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  call: "Calls",
  contact: "Contacts",
  sms: "SMS",
  chat: "Chat (WhatsApp/Telegram)",
  gps: "GPS / Location",
  browser: "Browser History",
  app_usage: "App Usage",
  notification: "Notifications",
  account: "Accounts",
  file: "Files / Deleted Artifacts",
  wifi: "WiFi",
  bluetooth: "Bluetooth",
  device_event: "Device Events",
  device_info: "Device Info",
  manifest: "Extraction Manifest",
  payment: "Payment / UPI",
  media: "Media / Photos",
  unknown: "Unclassified",
};

export interface Artifact {
  id: string;
  type: ArtifactType;
  source: string;
  ts: number | null;
  text: string;
  parties: string[];
  app: string | null;
  direction: string | null;
  lat: number | null;
  lon: number | null;
  place: string | null;
  deleted: boolean;
  raw: Record<string, string>;
}

export type EntityKind =
  | "person"
  | "phone"
  | "handle"
  | "email"
  | "upi"
  | "account"
  | "device"
  | "location"
  | "merchant"
  | "app"
  | "face"
  | "media";

export interface Entity {
  id: string;
  kind: EntityKind;
  value: string;
  label: string;
  aliases: string[];
  artifactIds: string[];
  firstSeen: number | null;
  lastSeen: number | null;
}

export type LinkStatus = "CONFIRMED" | "PROBABLE" | "POSSIBLE" | "UNVERIFIED";
export type Verdict = "ACCEPT" | "REJECT" | "REVIEW";

export interface Link {
  id: string;
  from: string;
  to: string;
  type: string;
  method: string;
  confidence: number;
  status: LinkStatus;
  evidenceIds: string[];
}

export interface Contradiction {
  id: string;
  kind: string;
  summary: string;
  sideA: { label: string; evidenceId: string; ts: number | null; detail: string };
  sideB: { label: string; evidenceId: string; ts: number | null; detail: string };
}

export interface Anomaly {
  id: string;
  label: string;
  detail: string;
  ts: number | null;
  evidenceIds: string[];
  signal: string;
}

export type Availability =
  | "AVAILABLE"
  | "NOT FOUND"
  | "NOT EXTRACTED"
  | "UNKNOWN"
  | "DATA INSUFFICIENT";

export interface CoverageRow {
  type: ArtifactType;
  status: Availability;
  count: number;
  note: string;
}

export interface PaymentRecord {
  evidenceId: string;
  ts: number | null;
  amount: number | null;
  currency: string;
  txnId: string | null;
  vpaFrom: string | null;
  vpaTo: string | null;
  merchant: string | null;
  bank: string | null;
  ifsc: string | null;
  accountRef: string | null;
  app: string | null;
  rawText: string;
}

export interface BankCorrelation {
  id: string;
  subject: string;
  result: "CORRELATED" | "POTENTIAL MISMATCH" | "DATA INSUFFICIENT";
  detail: string;
  evidenceIds: string[];
}

export interface IndexedDoc {
  artifactId: string;
  tokens: string[];
  tf: Record<string, number>;
  len: number;
  vector: number[];
}

export interface EvidenceIndex {
  docs: IndexedDoc[];
  df: Record<string, number>;
  avgLen: number;
}

export interface CaseFileMeta {
  name: string;
  size: number;
  sha256: string;
  rows: number;
  type: ArtifactType;
}

export interface CaseBundle {
  id: string;
  name: string;
  investigator: string;
  createdAt: number;
  zipName: string;
  zipSha256: string;
  files: CaseFileMeta[];
  artifacts: Artifact[];
  entities: Entity[];
  links: Link[];
  contradictions: Contradiction[];
  anomalies: Anomaly[];
  coverage: CoverageRow[];
  payments: PaymentRecord[];
  bankCorrelations: BankCorrelation[];
  index: EvidenceIndex;
  verdicts: Record<string, Verdict>;
  groundTruthFile: string | null;
  answers: SavedAnswer[];
  activity?: ActivityEvent[];
  notes?: CaseNote[];
  bookmarks?: string[];
  openQuestions?: OpenQuestion[];
  canvases?: CanvasMap[];
  reportCanvasId?: string | null | undefined;
}

export type ActivityAction =
  | "CASE_IMPORTED"
  | "QUERY"
  | "EVIDENCE_VIEWED"
  | "EVIDENCE_BOOKMARKED"
  | "NOTE_ADDED"
  | "LINK_ACCEPTED"
  | "LINK_REJECTED"
  | "LINK_REVIEW"
  | "VERIFICATION_CLEARED"
  | "REPORT_GENERATED"
  | "CANVAS_SAVED"
  | "CANVAS_CLEARED"
  | "CANVAS_EXPORTED"
  | "CANVAS_ATTACHED"
  | "HANDOFF_UPDATED";

export interface ActivityEvent {
  id: string;
  ts: number;
  investigator: string;
  action: ActivityAction;
  detail: string;
  evidenceIds: string[];
}

export interface CaseNote {
  id: string;
  investigator: string;
  ts: number;
  text: string;
  evidenceIds: string[];
}

export interface OpenQuestion {
  id: string;
  investigator: string;
  ts: number;
  text: string;
  resolved: boolean;
}

export type CanvasEdgeKind = "EVIDENCE" | "HYPOTHESIS" | "CONTRADICTION";

export interface CanvasNode {
  id: string;
  kind: "entity" | "text" | "sticky" | "group";
  entityId: string | null;
  entityKind: string | null;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  evidenceIds: string[];
  investigator: string;
  ts: number;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  kind: CanvasEdgeKind;
  label: string;
  linkId: string | null;
  evidenceIds: string[];
  source: string | null;
  ts: number | null;
  confidence: number | null;
  investigator: string;
  createdAt: number;
}

export interface CanvasStroke {
  id: string;
  tool: "pencil" | "pen" | "highlighter";
  points: number[];
  color: string;
  width: number;
  investigator: string;
  ts: number;
}

export interface CanvasMap {
  id: string;
  caseId: string;
  name: string;
  investigator: string;
  createdAt: number;
  updatedAt: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
  snapshot: string | null;
}

export type AnswerStatus = "ANSWERED" | "PARTIAL" | "DATA INSUFFICIENT";

export interface ReasoningTrace {
  question: string;
  retrieved: string[];
  entities: string[];
  relationships: string[];
  timeline: string[];
  supporting: string[];
  contradictions: string[];
  missing: string[];
  confidenceSignals: string[];
  conclusion: string;
}

export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  status: AnswerStatus;
  engine: string;
  evidenceIds: string[];
  sources: string[];
  confidence: number;
  contradictions: string[];
  missing: string[];
  trace: ReasoningTrace;
  createdAt: number;
}
