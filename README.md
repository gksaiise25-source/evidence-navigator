# Evidence Navigator

Build NEXORA — an offline-first AI UFDR forensic investigation platform.

IMPORTANT: Build a REAL working application, not a static UI/mockup.

INPUT:

A UFDR ZIP containing CSV/JSON artifacts such as:

calls, contacts, SMS, WhatsApp, Telegram, GPS, browser history,

app usage, notifications, accounts, files/deleted artifacts,

WiFi, Bluetooth, device events, device info and extraction manifest.

CORE PIPELINE:

UFDR ZIP

→ Parser & Normalization

→ Entity/Artifact Extraction

→ Cross-Modal Entity Linking

→ Knowledge Graph

→ Evidence Index

→ Timeline + Anomaly Detection

→ Graph-RAG

→ Local Llama

→ Evidence Validation

→ Investigator UI

→ PDF Report

OFFLINE ONLY:

Use local processing with Python/FastAPI, SQLite, NetworkX,

BGE-M3, FAISS, spaCy/IndicNER, InsightFace, Ollama + Llama.

NO OpenAI/Gemini/Claude/cloud AI/cloud vector DB/cloud evidence upload.

CRITICAL ANTI-HALLUCINATION RULE:

NEXORA MUST NEVER guess or invent evidence.

LLM can ONLY answer from retrieved evidence.

If evidence is insufficient, show:

"DATA INSUFFICIENT"

and explain:

- available evidence

- missing evidence

- what cannot be established

Never convert "not found" into "did not happen".

Never infer guilt.

Never invent people, locations, transactions, bank details or relationships.

ENTITY LINKING:

Link only when supported by evidence:

Person ↔ Phone ↔ Contact ↔ WhatsApp ↔ Telegram ↔ Face

↔ Photo ↔ Location ↔ GPS ↔ Device ↔ Payment ↔ UPI ↔ Account.

Every relationship must store:

confidence + supporting Evidence IDs + linking method.

ENTITY EVOLUTION:

Create an identity-history page showing aliases, phones, faces,

UPI IDs, accounts, devices, locations and communication history.

Classify links as:

CONFIRMED / PROBABLE / POSSIBLE / UNVERIFIED.

KNOWLEDGE GRAPH:

Show entities and evidence-backed relationships interactively.

EVIDENCE INDEX:

Use local BGE-M3 + FAISS.

TIMELINE:

Combine calls, messages, GPS, photos, apps, browser, device,

WiFi/Bluetooth and payment artifacts.

Detect potential anomalies but label them only as investigative leads.

MISSING EVIDENCE DETECTOR:

Show:

AVAILABLE / NOT FOUND / NOT EXTRACTED / UNKNOWN / DATA INSUFFICIENT.

Never say "no payment occurred" merely because payment data is absent.

Say "No relevant payment artifact was found in the available extraction."

UPI / FINANCIAL INTELLIGENCE:

Extract only available:

UPI/VPA, transaction ID, amount, timestamp, merchant,

payer/payee, payment app, bank name, IFSC, account identifiers,

SMS/payment notifications/receipts.

Create evidence-backed links between:

Person ↔ UPI ↔ Payment ↔ Account ↔ Merchant ↔ Message.

BANK VERIFICATION:

Because the system is offline, DO NOT perform fake live bank verification.

Instead implement "Bank Detail Correlation" using only evidence inside

the UFDR.

Possible results:

CORRELATED

POTENTIAL MISMATCH

DATA INSUFFICIENT

CONTRADICTION DETECTOR:

Detect conflicting evidence such as:

message location ≠ GPS location.

Show both sources, timestamps and evidence IDs.

Never decide which source is true automatically.

GRAPH-RAG:

Question

→ BGE-M3 retrieval

→ FAISS search

→ Graph search

→ Timeline/entity/financial search

→ evidence ranking

→ Llama.

Never send the question directly to Llama.

LLAMA:

Run locally through Ollama.

System rule:

"Only use supplied evidence. Never guess. If insufficient, say DATA INSUFFICIENT."

TRANSPARENCY:

Do NOT expose private chain-of-thought.

Instead show an "Evidence Reasoning Trace":

Question

→ Retrieved Evidence

→ Entities

→ Relationships

→ Timeline

→ Supporting Evidence

→ Contradictions

→ Missing Evidence

→ Confidence Signals

→ Conclusion.

INVESTIGATOR UI:

Premium cybersecurity forensic command center.

Theme:

dark black/charcoal

emerald green

cyber green

subtle neon glow

glass panels

technical grid

professional SOC/forensic style.

Pages:

Dashboard

UFDR Import

Evidence Explorer

Entities

Entity Evolution

Knowledge Graph

Timeline

Geospatial Map

Financial/UPI Intelligence

Contradictions

Missing Evidence

AI Investigation

Reports

Settings.

Dashboard must show REAL data only.

AI chat questions such as:

"What connects Rahul to the warehouse?"

"What evidence is linked to this phone?"

"What happened between 18:00 and 20:00?"

"What financial evidence is linked?"

"What evidence is missing?"

"Show identity history."

Every answer must show:

Answer

Status

Evidence IDs

Sources

Confidence

Contradictions

Missing Evidence

WHY?

VIEW EVIDENCE

VIEW GRAPH

HUMAN VERIFICATION:

For uncertain links:

ACCEPT / REJECT / REVIEW.

Store decisions locally.

PDF REPORT:

Generate a professional forensic PDF containing:

case information

UFDR/hash

available artifacts

missing data

entities

entity evolution

cross-modal links

graph summary

timeline

anomalies

UPI/financial artifacts

bank correlations

contradictions

event reconstruction

AI answers

Evidence Reasoning Trace

confidence

human verification

evidence IDs

sources

limitations.

Clearly separate:

FACT

AI INTERPRETATION

INVESTIGATIVE LEAD

CONTRADICTION

DATA INSUFFICIENT

HUMAN VERIFIED.

SECURITY:

Local-only processing

SHA-256

case isolation

safe ZIP handling

no telemetry

no external uploads

no raw evidence in logs.

Use the supplied synthetic_ground_truth.csv ONLY for testing/evaluation,

never as normal investigator evidence.

FREE MODEL REQUIREMENT:

Keep the implementation simple and modular.

Avoid unnecessary agents and dependencies.

Prioritize working functionality over excessive complexity.

Build the complete connected frontend + backend and make every UI

element use real backend data.

FINAL RULE:

If evidence is insufficient, NEVER GUESS.

Display DATA INSUFFICIENT.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ac5bd09e-8d1a-4c1d-a899-af9355c83e24).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
