# FINZ — AI-Native Financial Review

**Live demo: https://finz-financial-review-lake.vercel.app** (Vercel + Turso/libSQL)

An AI-native financial review application that turns raw bank transactions into an explainable
monthly P&L: ingest → categorize → review → calculate → explain → investigate.

Built for the FINZ Software Engineering Internship challenge.

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add your NVIDIA (or any OpenAI-compatible) API key
npm run dev                        # http://localhost:3000
```

Then in the app:

1. **Ingest** → *Load sample dataset* (247 transactions, Feb–Jul 2026) or upload your own CSV.
2. **Categorize** → *Run AI categorization* (batched LLM calls with a keyword fallback).
3. **Transactions** → inspect categories/confidence, correct anything wrong.
4. **P&L** → monthly statements with drill-down to categories and transactions.
5. **Variances** → material month-over-month changes, drivers, AI explanation, raw evidence.
6. **Review** → resolve uncertain, unusual or inconsistent items.
7. **AI Analyst** → ask questions; every answer is grounded in tool results and figure-verified.

```bash
npm run generate   # regenerate the sample dataset deterministically
npm run build      # production build
npm run lint       # eslint
```

### Environment variables (`.env.local`)

| Variable | Purpose | Default |
| --- | --- | --- |
| `NVIDIA_API_KEY` | API key for the model endpoint (OpenAI-compatible) | — |
| `NVIDIA_BASE_URL` | Base URL of the OpenAI-compatible endpoint | `https://integrate.api.nvidia.com/v1` |
| `AI_MODEL` | Chat/completion model used for classification, explanations and the analyst | `meta/llama-3.2-11b-vision-instruct` |
| `DATABASE_PATH` | Local SQLite file location (file mode only) | `data/finz.db` |
| `TURSO_DATABASE_URL` | Hosted libSQL URL (`libsql://…`) for production; unset = local file | — |
| `TURSO_AUTH_TOKEN` | Hosted database auth token | — |

`OPENAI_API_KEY` / any OpenAI-compatible base URL also works — the client is standard `openai` SDK.

---

## Architecture

```
Next.js 16 (App Router, TypeScript)  ── single deployable unit
├── src/app/**              UI (client pages) + Route Handlers (API)
├── src/lib/
│   ├── db.ts               @libsql/client connection, schema + typed query helpers
│   ├── csv.ts              flexible bank-CSV parser (column auto-detection)
│   ├── categories.ts       chart of accounts (P&L lines, treatments, keywords)
│   ├── transactions.ts     transaction repository + human corrections
│   ├── pnl.ts              ★ deterministic P&L engine (integer cents)
│   ├── variance.ts         ★ deterministic variance engine + materiality
│   ├── review.ts           ★ deterministic review rules (8 rule families)
│   ├── ingest.ts           parse → insert → scan orchestration
│   └── ai/
│       ├── client.ts       OpenAI-compatible client + JSON extraction
│       ├── categorize.ts   batched LLM classification + keyword fallback
│       ├── explain.ts      variance narration + figure verification
│       └── analyst.ts      tool-using analyst + evidence log + verifier
├── data/bank_transactions.csv   generated sample statement
└── scripts/generate-dataset.mjs reproducible dataset generator
```

Storage is SQLite via `@libsql/client` with five tables: `transactions`, `classifications`
(one row per transaction, `source = ai | rules | human`), `corrections` (audit trail of every
human override), `review_items` (flag → resolve lifecycle) and `chat_messages`.

The same driver covers both environments:

- **Local**: `file:data/finz.db` (WAL) — zero configuration, `npm run dev` just works.
- **Production**: set `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) and every query runs against
  a hosted libSQL/Turso database — no filesystem needed, so the app deploys to serverless
  platforms like Vercel without changing a line of SQL. All writes go through atomic batches.

---

## Where and why AI is used

| Use | Where | Why AI |
| --- | --- | --- |
| Transaction categorization | `ai/categorize.ts` | Reading arbitrary merchant descriptions ("UPI//P2A/8837291", "PAYMENT TO M/S KRISHNA SUPPLIERS") and choosing the right accounting category is semantic judgment, not arithmetic. Each batch returns `category_id`, `confidence`, `reasoning`, `needs_review`. |
| Variance narration | `ai/explain.ts` | Turning a table of deltas into a human explanation ("opex grew faster than revenue, driven by the March campaign") is language work. |
| Conversational investigation | `ai/analyst.ts` | The analyst decides *which* questions to ask the data (tool selection, multi-step investigation), then narrates the results. |
| (fallback) keyword rules | `ai/categorize.ts` | If the model is unavailable, a deterministic keyword matcher classifies instead — and every such row is flagged `RULES_FALLBACK` for human review. |

## Where and why deterministic logic is used

| Use | Where | Why deterministic |
| --- | --- | --- |
| All money math | `pnl.ts` | Revenue, COGS, gross profit, payroll, OpEx, operating profit are summed in **integer cents** from classified rows. The LLM never produces, adds or rounds a total. |
| Variance detection | `variance.ts` | Deltas, percentages, materiality (≥ $500 **and** ≥ 10% of the prior month), ranking and driver attribution are computed from the same rows as the P&L. |
| Exception detection | `review.ts` | Balance reconciliation, duplicates, outliers (z > 3), round numbers, opaque descriptions, low confidence, treatment judgment — all rule-based and re-runnable. |
| Treatment derivation | `categories.ts` | Whether a category is P&L or non-P&L comes from the chart of accounts, never from the model. |
| CSV parsing | `csv.ts` | Column detection, date/amount normalization (signs, parentheses, CR/DR, debit/credit columns) is code, with per-row errors reported. |
| Human corrections | `transactions.ts` | A correction writes `source = human`, an audit row in `corrections`, and auto-resolves confidence flags — then everything recomputes. |

**Rule of thumb applied throughout:** AI decides *meaning and narrative*; code decides *numbers*.

---

## How incorrect or unsupported financial answers are prevented

1. **Tool-first architecture.** The analyst has no arithmetic tools of its own. Its system prompt
   requires every figure to come from a tool result (`get_pnl`, `get_variances`,
   `list_transactions`, `get_review_items`, …). All six tools read the same deterministic engine
   the UI uses, so an answer and the P&L page can never disagree.
2. **Numbers are pre-computed before the model sees them.** The model receives formatted strings
   (`"51054.03"`), not raw material to recompute. It cannot "forget a digit" while adding, because
   it never adds.
3. **Evidence is logged.** Every tool call, its arguments and its payload are recorded with the
   answer and shown in the UI as clickable evidence chips (`/pnl?month=…`, `/variances?from=…`,
   `/transactions?category=…`).
4. **Non-P&L separation.** Transfers, loans, capex, owner drawings and tax remittances are held
   out of the P&L by the chart of accounts, so financing movements can never inflate "expenses".
5. **Unclassified rows are excluded, never estimated.** If classification coverage is < 100% the
   P&L shows exactly how many transactions and how much value are missing instead of guessing.
6. **The variance explainer only sees material, computed evidence** — it cannot introduce a month
   or a line that was not compared.

## How the system output is verified

- **Answer verifier (`ai/explain.ts` → `unsupportedFigures`).** After the analyst (or variance
  explainer) writes text, a deterministic checker extracts every `$X,XXX.XX` figure and looks it up
  in the *complete tool-evidence set* (cents-exact or whole-dollar rounding). Any figure that is
  not in the evidence is reported.
- **Repair pass.** If unsupported figures are found, the model gets one corrective round: "these
  figures are not in any tool result — rewrite using only evidence figures". The result is
  re-checked.
- **The UI shows the outcome on every answer:** `N figures verified` (green) or
  `N figure(s) unsupported` (red) plus `auto-repaired` when the repair pass ran. The variance panel
  shows `verified` / `figures withheld` and lists anything withheld.
- **Explanation fallback.** If the model fails or is disabled, the system falls back to a
  deterministic driver summary (pure arithmetic narrative) and labels it `deterministic`.
- **Self-checks in the data layer.** Balance re-computation flags statement inconsistencies;
  duplicate/outlier/round-number rules flag suspicious rows; AI confidence < 70%, `needs_review`
  flags and rule-fallback rows all land in the review queue instead of silently flowing into the
  P&L.

---

## Data model notes

**Chart of accounts** (`categories.ts`): 30 categories across `REVENUE | COGS | PAYROLL | OPEX`
(P&L) and `NON_P_AND_L` (transfers, loan proceeds, EMI principal, capex, owner draws, indirect
tax). Each carries a description used in the prompt plus keywords for the deterministic fallback.

**Sign convention:** transactions store signed cents (money in > 0). Revenue lines sum signs as-is;
expense lines negate them, so refunds/credits naturally reduce a cost line.

**Materiality:** `|Δ| ≥ $500` **and** `|Δ| / prior ≥ 10%` (or any movement from a zero base).
Constants live at the top of `variance.ts`.

**Review reasons:** low confidence, rule fallback, AI-flagged, treatment judgment, duplicate,
outlier, round number, opaque description, balance mismatch, unusual inflow.

---

## The sample dataset

`data/bank_transactions.csv` (247 rows, Feb–Jul 2026, deterministic seed — `npm run generate`)
simulates a café with a deliberate story for the review:

- **March**: paid-social + search campaign spikes OpEx (~$10.5k), including a **duplicated Meta
  charge** (two identical debits 2 days apart) → operating profit falls despite revenue growth.
- **April**: two new hires lift payroll; an opaque `UPI//P2A/…` payment and a fixed deposit.
- **May**: one-off **oven purchase (capex, non-P&L)**, a round-number consulting fee, higher food
  costs.
- **June**: audit fee one-off, ambiguous "AMAZON - MIXED ORDER", unknown vendor payment.
- **July**: unexplained ACH inflow (revenue treatment needs confirmation).
- One row deliberately **breaks statement balance continuity** so the reconciliation rule fires.

---

## Walkthrough (matches the required demo)

1. **File ingestion** — Ingest → *Load sample dataset* → 247 rows parsed, columns auto-detected.
2. **Transaction categorization** — *Run AI categorization* → 247/247 classified (confidence +
   reasoning per row).
3. **Classification correction** — Transactions → expand a row → change category → *Save
   correction* (`source=human`, audit row, P&L recalculates; cross-section moves are visible in
   COGS vs OpEx).
4. **Generated P&L** — P&L page → month tabs → drill into any line → category → transactions.
5. **Material variance + drivers** — Variances → `Feb → Mar` → operating profit −$6,231.49 (−73.7%)
   with category drivers and the underlying transactions.
6. **Two questions through the AI interface** — e.g. *"What was our revenue in March?"* →
   `$51,054.03` with a `P&L Mar 2026` evidence chip; *"Why did operating profit change between
   February and March?"* → explained with `+/-` figures from the variance tool.
7. **Traceability** — click any evidence chip to land on the exact P&L month, variance comparison
   or filtered transaction list that produced the answer; each answer shows `N figures verified`.

---

## Deployment (Vercel)

The app runs on Vercel as a standard Next.js project; SQLite lives on **Turso/libSQL** so no
persistent disk is required:

1. Create the database: `turso db create finz` → note `turso db show finz --url` and
   `turso db tokens create finz`.
2. `vercel link` in the repo, then set the project environment variables:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `AI_MODEL`.
3. `vercel deploy --prod`. Every serverless function talks to the same hosted database, so
   ingestions, corrections and chat history are shared across routes and survive cold starts.
4. Locally nothing changes: without `TURSO_DATABASE_URL` the app keeps using `data/finz.db`.

Notes:

- Serverless filesystems are ephemeral — never point `DATABASE_PATH` at `/tmp` in production.
- The app is fully functional without AI: classification falls back to keyword rules (flagged
  for review) and explanations fall back to deterministic driver summaries.

## Testing / verification commands

```bash
npm run lint        # eslint (react-hooks, no sync setState in effects)
npx tsc --noEmit    # strict TypeScript
npm run build       # production build incl. type check
```

Runtime checks used during development: ingest → classify → `/api/pnl` per-month totals,
cross-section correction delta (± $1,240 between COGS and OpEx), review resolve lifecycle, and
figure verification on analyst/variance answers.
