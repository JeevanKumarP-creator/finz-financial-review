import Papa from "papaparse";
import { createHash } from "node:crypto";

export interface NormalizedRow {
  date: string;
  description: string;
  counterparty: string | null;
  reference: string | null;
  amountCents: number;
  balanceCents: number | null;
  contentHash: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: NormalizedRow[];
  columns: string[];
  mapping: Record<string, string | null>;
  errors: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function findColumn(columns: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const hit = columns.find((c) => p.test(c.trim()));
    if (hit) return hit;
  }
  return null;
}

export function parseAmountToCents(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(dr|debit)\b/i.test(s)) negative = true;
  s = s.replace(/\b(cr|credit)\b/i, "").replace(/[$€£₹,\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(s);
  if (m) {
    const [, a, b, y] = m;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) return `${y}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    if (second > 12 && first <= 12) return `${y}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
    return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  m = /^(\d{1,2})[ -]([a-z]{3})[ -](\d{4})$/i.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function hashOf(date: string, description: string, amountCents: number, reference: string | null): string {
  return createHash("sha256")
    .update(`${date}|${description.toUpperCase().trim()}|${amountCents}|${(reference ?? "").trim()}`)
    .digest("hex")
    .slice(0, 32);
}

export function parseBankCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const columns = (parsed.meta.fields ?? []).filter(Boolean);
  const errors: string[] = [];
  parsed.errors.slice(0, 10).forEach((e) => errors.push(`Row ${e.row}: ${e.message}`));

  const mapping = {
    date: findColumn(columns, [/transaction date/i, /posting date/i, /value date/i, /^\s*date\s*$/i]),
    description: findColumn(columns, [/description/i, /narration/i, /particulars/i, /details/i, /memo/i, /transaction/i]),
    debit: findColumn(columns, [/^\s*debit\s*$/i, /withdrawal/i, /money out/i, /paid out/i]),
    credit: findColumn(columns, [/^\s*credit\s*$/i, /deposit(?!.*balance)/i, /money in/i, /paid in/i]),
    amount: findColumn(columns, [/^\s*amount\s*$/i, /value(?! date)/i]),
    balance: findColumn(columns, [/balance/i]),
    counterparty: findColumn(columns, [/counterparty/i, /payee/i, /merchant/i, /party/i]),
    reference: findColumn(columns, [/reference/i, /^\s*ref/i, /transaction id/i, /^\s*id\s*$/i]),
  };

  if (!mapping.date) errors.push("Could not find a date column.");
  if (!mapping.description && !mapping.amount && !mapping.debit && !mapping.credit) {
    errors.push("Could not find a description or amount column.");
  }

  const rows: NormalizedRow[] = [];
  if (mapping.date && parsed.data.length > 0) {
    parsed.data.forEach((raw, idx) => {
      const date = parseDate(raw[mapping.date!] ?? "");
      const description = String(raw[mapping.description ?? ""] ?? "").trim();
      if (!date) {
        if (Object.values(raw).some((v) => String(v ?? "").trim())) {
          errors.push(`Row ${idx + 2}: unreadable date "${raw[mapping.date!] ?? ""}"`);
        }
        return;
      }
      if (!description) {
        errors.push(`Row ${idx + 2}: missing description`);
        return;
      }

      let amountCents: number | null = null;
      if (mapping.debit || mapping.credit) {
        const debit = mapping.debit ? parseAmountToCents(raw[mapping.debit] ?? "") : null;
        const credit = mapping.credit ? parseAmountToCents(raw[mapping.credit] ?? "") : null;
        if (debit != null && debit !== 0) amountCents = -Math.abs(debit);
        else if (credit != null && credit !== 0) amountCents = Math.abs(credit);
        else if (mapping.amount) amountCents = parseAmountToCents(raw[mapping.amount] ?? "");
      } else if (mapping.amount) {
        amountCents = parseAmountToCents(raw[mapping.amount] ?? "");
      }

      if (amountCents == null || amountCents === 0) {
        errors.push(`Row ${idx + 2}: could not read a non-zero amount`);
        return;
      }

      const balanceCents = mapping.balance ? parseAmountToCents(raw[mapping.balance] ?? "") : null;
      const counterparty = mapping.counterparty ? String(raw[mapping.counterparty] ?? "").trim() || null : null;
      const reference = mapping.reference ? String(raw[mapping.reference] ?? "").trim() || null : null;
      const rawClean: Record<string, string> = {};
      for (const c of columns) rawClean[c] = String(raw[c] ?? "");

      rows.push({
        date,
        description,
        counterparty,
        reference,
        amountCents,
        balanceCents,
        contentHash: hashOf(date, description, amountCents, reference),
        raw: rawClean,
      });
    });
  }

  return { rows, columns, mapping, errors };
}
