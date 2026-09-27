import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso, qRun } from "./db";
import { parseBankCsv, type ParseResult } from "./csv";
import { insertParsedRows } from "./transactions";
import { scanReviewItems } from "./review";
import { countUnclassified } from "./ai/categorize";

export interface IngestResult {
  filename: string;
  parsedRows: number;
  inserted: number;
  skipped: number;
  columns: string[];
  mapping: Record<string, string | null>;
  errors: string[];
  openReviewItems: number;
  unclassifiedRemaining: number;
}

async function persistIngestion(
  filename: string,
  result: ParseResult
): Promise<{ ingestionId: number; inserted: number; skipped: number }> {
  const ing = await qRun(
    `INSERT INTO ingestions (filename, ingested_at, row_count) VALUES (?, ?, ?)`,
    filename,
    nowIso(),
    result.rows.length
  );
  const ingestionId = ing.lastInsertRowid;
  const { inserted, skipped } = await insertParsedRows(result.rows, ingestionId);
  return { ingestionId, inserted, skipped };
}

export async function ingestCsvText(text: string, filename: string): Promise<IngestResult> {
  const parsed = parseBankCsv(text);
  const { inserted, skipped } = await persistIngestion(filename, parsed);
  const scan = await scanReviewItems();
  return {
    filename,
    parsedRows: parsed.rows.length,
    inserted,
    skipped,
    columns: parsed.columns,
    mapping: parsed.mapping,
    errors: parsed.errors.slice(0, 25),
    openReviewItems: scan.total,
    unclassifiedRemaining: await countUnclassified(),
  };
}

export function ingestSampleDataset(): Promise<IngestResult> {
  const path = join(process.cwd(), "data", "bank_transactions.csv");
  const text = readFileSync(path, "utf8");
  return ingestCsvText(text, "bank_transactions.csv (sample)");
}
