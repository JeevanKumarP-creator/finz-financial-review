import { nowIso, qAll, qBatch, qGet } from "../db";
import { CATEGORIES, CATEGORY_MAP, isCategoryId } from "../categories";
import { aiModel, aiConfigured, extractJson, getAiClient } from "./client";

export interface RawTxn {
  id: number;
  date: string;
  description: string;
  counterparty: string | null;
  amountCents: number;
}

export interface ClassificationDecision {
  transactionId: number;
  categoryId: string;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
  source: "ai" | "rules";
}

const BATCH_SIZE = 15;

export async function unclassifiedTransactions(limit: number): Promise<RawTxn[]> {
  return qAll<RawTxn>(
    `SELECT t.id, t.date, t.description, t.counterparty, t.amount_cents AS amountCents
     FROM transactions t
     LEFT JOIN classifications cl ON cl.transaction_id = t.id
     WHERE cl.transaction_id IS NULL
     ORDER BY t.date, t.id
     LIMIT ?`,
    limit
  );
}

export async function countUnclassified(): Promise<number> {
  const row = await qGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions t
     LEFT JOIN classifications cl ON cl.transaction_id = t.id
     WHERE cl.transaction_id IS NULL`
  );
  return row?.n ?? 0;
}

function chartText(): string {
  return CATEGORIES.map(
    (c) => `- ${c.id} | ${c.label} | ${c.treatment === "P_AND_L" ? "P&L" : "non-P&L"} | ${c.description}`
  ).join("\n");
}

function buildPrompt(batch: RawTxn[]): string {
  const lines = batch.map(
    (t, i) =>
      `${i + 1}. id=${t.id} | ${t.date} | ${t.description}${t.counterparty ? ` | payee: ${t.counterparty}` : ""} | amount=${(t.amountCents / 100).toFixed(2)} ${t.amountCents >= 0 ? "(money in)" : "(money out)"}`
  );
  return `Classify each bank transaction below into exactly ONE category from the chart of accounts.

CHART OF ACCOUNTS:
${chartText()}

TRANSACTIONS:
${lines.join("\n")}

Rules:
- Choose the single best category_id from the list above. Never invent an id.
- Uncertain or opaque descriptions: pick the most plausible category but set confidence below 0.5 and needs_review=true.
- Internal transfers, owner drawings, loan principal repayments, asset purchases and tax remittances are NOT expenses - pick the matching nonpl_* id.
- Card processor payouts and invoice payments received are revenue.
- confidence is a number from 0 to 1. reasoning is one short sentence.

Reply with ONLY JSON, no prose:
{"results":[{"id":<transaction id>,"category_id":"<id>","confidence":0.0,"reasoning":"<one sentence>","needs_review":false}]}`;
}

function rulesDecide(t: RawTxn): ClassificationDecision {
  const desc = `${t.description} ${t.counterparty ?? ""}`.toLowerCase();
  let best = { id: "", score: 0, hits: 0 };
  for (const c of CATEGORIES) {
    let score = 0;
    let hits = 0;
    for (const k of c.keywords) {
      const kw = k.toLowerCase();
      if (desc.includes(kw)) {
        hits++;
        score += 10 + kw.length;
      }
    }
    if (score > best.score) best = { id: c.id, score, hits };
  }
  if (!best.id) {
    best = { id: t.amountCents >= 0 ? "revenue_other" : "opex_other", score: 0, hits: 0 };
  }
  const confidence = best.hits === 0 ? 0.3 : Math.min(0.65, 0.45 + best.hits * 0.1);
  return {
    transactionId: t.id,
    categoryId: best.id,
    confidence,
    reasoning: `Keyword fallback matched ${best.hits} pattern(s) for "${CATEGORY_MAP[best.id]?.label ?? best.id}" (AI unavailable).`,
    needsReview: true,
    source: "rules",
  };
}

function parseAiBatch(content: string | null, batch: RawTxn[]): ClassificationDecision[] | null {
  if (!content) return null;
  const parsed = extractJson(content) as { results?: unknown } | unknown[] | null;
  if (!parsed) return null;
  const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { results?: unknown }).results) ? (parsed as { results: unknown[] }).results : null;
  if (!arr) return null;

  const valid: ClassificationDecision[] = [];
  const seen = new Set<number>();
  for (const raw of arr) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = Number(r.id ?? r.transaction_id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    if (!batch.some((t) => t.id === id)) continue;
    const categoryId = String(r.category_id ?? r.category ?? "");
    if (!isCategoryId(categoryId)) continue;
    const confRaw = Number(r.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.5;
    valid.push({
      transactionId: id,
      categoryId,
      confidence,
      reasoning: String(r.reasoning ?? "").slice(0, 400),
      needsReview: r.needs_review === true || r.needsReview === true || confidence < 0.5,
      source: "ai",
    });
    seen.add(id);
  }
  if (valid.length === 0) return null;
  return valid;
}

async function saveDecisions(decisions: ClassificationDecision[]): Promise<void> {
  const now = nowIso();
  await qBatch(
    decisions.map((d) => ({
      sql: `INSERT INTO classifications (transaction_id, category_id, treatment, confidence, reasoning, source, needs_review, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transaction_id) DO UPDATE SET
         category_id = excluded.category_id,
         treatment = excluded.treatment,
         confidence = excluded.confidence,
         reasoning = excluded.reasoning,
         source = excluded.source,
         needs_review = excluded.needs_review,
         updated_at = excluded.updated_at`,
      args: [
        d.transactionId,
        d.categoryId,
        CATEGORY_MAP[d.categoryId]?.treatment ?? "NON_P_AND_L",
        d.confidence,
        d.reasoning,
        d.source,
        d.needsReview ? 1 : 0,
        now,
      ],
    }))
  );
}

async function classifyBatchWithAi(batch: RawTxn[]): Promise<ClassificationDecision[] | null> {
  try {
    const res = await getAiClient().chat.completions.create({
      model: aiModel(),
      temperature: 0,
      max_tokens: Math.min(4000, 400 + batch.length * 160),
      messages: [
        {
          role: "system",
          content:
            "You are a careful bookkeeping classifier for a small-business financial review tool. You output strict JSON only.",
        },
        { role: "user", content: buildPrompt(batch) },
      ],
    });
    return parseAiBatch(res.choices[0]?.message?.content ?? null, batch);
  } catch {
    return null;
  }
}

export async function classifyBatch(limit: number): Promise<{
  processed: number;
  aiDecided: number;
  rulesDecided: number;
  remaining: number;
  aiAvailable: boolean;
}> {
  const batch = await unclassifiedTransactions(limit);
  if (batch.length === 0) {
    return { processed: 0, aiDecided: 0, rulesDecided: 0, remaining: 0, aiAvailable: aiConfigured() };
  }

  const decisions: ClassificationDecision[] = [];
  let aiDecided = 0;
  let rulesDecided = 0;
  let aiAvailable = aiConfigured();

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const slice = batch.slice(i, i + BATCH_SIZE);
    let aiResult: ClassificationDecision[] | null = null;
    if (aiAvailable) {
      aiResult = await classifyBatchWithAi(slice);
      if (!aiResult) aiAvailable = false;
    }
    if (aiResult && aiResult.length > 0) {
      const covered = new Set(aiResult.map((d) => d.transactionId));
      const missing = slice.filter((t) => !covered.has(t.id)).map(rulesDecide);
      decisions.push(...aiResult, ...missing);
      aiDecided += aiResult.length;
      rulesDecided += missing.length;
    } else {
      const fallback = slice.map(rulesDecide);
      decisions.push(...fallback);
      rulesDecided += fallback.length;
    }
  }

  await saveDecisions(decisions);
  return {
    processed: decisions.length,
    aiDecided,
    rulesDecided,
    remaining: await countUnclassified(),
    aiAvailable,
  };
}
