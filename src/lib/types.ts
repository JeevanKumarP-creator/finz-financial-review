export type Treatment = "P_AND_L" | "NON_P_AND_L";
export type Section = "REVENUE" | "COGS" | "PAYROLL" | "OPEX";
export type ClassificationSource = "ai" | "rules" | "human";
export type ReviewStatus = "open" | "resolved";

export interface Category {
  id: string;
  label: string;
  section: Section | null;
  treatment: Treatment;
  description: string;
  keywords: string[];
}

export interface Classification {
  categoryId: string;
  treatment: Treatment;
  confidence: number;
  reasoning: string | null;
  source: ClassificationSource;
  needsReview: boolean;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  counterparty: string | null;
  reference: string | null;
  amountCents: number;
  balanceCents: number | null;
  category: Category | null;
  classification: Classification | null;
  reviewFlags: ReviewFlag[];
}

export interface ReviewFlag {
  id: number;
  reasonCode: string;
  severity: "high" | "medium" | "low";
  detail: string | null;
  status: ReviewStatus;
}

export interface PnlCategoryTotals {
  categoryId: string;
  label: string;
  amountCents: number;
  transactionCount: number;
}

export interface PnlLine {
  id: string;
  label: string;
  amountCents: number;
  transactionCount: number;
  categories: PnlCategoryTotals[];
}

export interface PnlStatement {
  month: string;
  revenue: PnlLine;
  cogs: PnlLine;
  grossProfit: PnlLine;
  payroll: PnlLine;
  opex: PnlLine;
  operatingProfit: PnlLine;
  unclassifiedCount: number;
  unclassifiedCents: number;
  nonPlCount: number;
  nonPlCents: number;
}

export interface VarianceDriverCategory {
  categoryId: string;
  label: string;
  deltaCents: number;
  currentCents: number;
  priorCents: number;
}

export interface VarianceDriverTransaction {
  id: number;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string;
  categoryLabel: string;
}

export interface VarianceLine {
  lineId: string;
  label: string;
  currentCents: number;
  priorCents: number;
  deltaCents: number;
  deltaPct: number | null;
  material: boolean;
  drivers: VarianceDriverCategory[];
  topTransactions: VarianceDriverTransaction[];
}

export interface VarianceComparison {
  from: string;
  to: string;
  materialityMinCents: number;
  materialityMinPct: number;
  lines: VarianceLine[];
  materialLineIds: string[];
}

export interface VarianceExplanation {
  headline: string;
  explanation: string;
  generatedBy: "ai" | "none";
  verified: boolean;
  issues: string[];
}

export interface EvidenceRef {
  kind: "pnl" | "variance" | "transactions" | "review";
  label: string;
  href: string;
}

export interface ChatEvidence {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  href: string;
}

export interface ChatVerification {
  checkedFigures: number;
  unsupportedFigures: string[];
  passed: boolean;
  repaired: boolean;
}

export interface ChatReply {
  reply: string;
  evidence: ChatEvidence[];
  verification: ChatVerification;
  toolCallCount: number;
}

export const PNL_LINE_ORDER = [
  "revenue",
  "cogs",
  "grossProfit",
  "payroll",
  "opex",
  "operatingProfit",
] as const;
