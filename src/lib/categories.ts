import type { Category, Section, Treatment } from "./types";

interface CategorySeed {
  id: string;
  label: string;
  section: Section | null;
  treatment: Treatment;
  description: string;
  keywords: string[];
}

const SEED: CategorySeed[] = [
  {
    id: "revenue_card_sales",
    label: "Card & POS Sales",
    section: "REVENUE",
    treatment: "P_AND_L",
    description: "Income from card payments settled by the payment processor (Razorpay, Stripe, POS settlement).",
    keywords: ["razorpay", "stripe", "pos settlement", "card sales", "card payment", "visa", "mastercard"],
  },
  {
    id: "revenue_cash_sales",
    label: "Cash Sales",
    section: "REVENUE",
    treatment: "P_AND_L",
    description: "Cash takings deposited from the counter till.",
    keywords: ["cash deposit", "till", "counter", "cash sales"],
  },
  {
    id: "revenue_corporate",
    label: "Corporate & Bulk Orders",
    section: "REVENUE",
    treatment: "P_AND_L",
    description: "Payments received against invoices for corporate, wholesale or bulk catering orders.",
    keywords: ["invoice payment", "corporate", "bulk order", "catering", "purchase order"],
  },
  {
    id: "revenue_subscriptions",
    label: "Subscription Revenue",
    section: "REVENUE",
    treatment: "P_AND_L",
    description: "Recurring subscription or membership plans billed to customers.",
    keywords: ["subscription", "membership", "renewal", "monthly plan"],
  },
  {
    id: "revenue_other",
    label: "Other Operating Revenue",
    section: "REVENUE",
    treatment: "P_AND_L",
    description: "Operating income that does not fit the other revenue categories.",
    keywords: ["refund from supplier", "rebate", "commission received", "interest received on current"],
  },
  {
    id: "cogs_food",
    label: "Food & Ingredient Costs",
    section: "COGS",
    treatment: "P_AND_L",
    description: "Ingredients, groceries and food inputs consumed to produce what was sold.",
    keywords: ["food", "ingredient", "grocery", "syso", "sysco", "metro cash", "vegetables", "dairy", "produce"],
  },
  {
    id: "cogs_beverages",
    label: "Coffee & Beverages",
    section: "COGS",
    treatment: "P_AND_L",
    description: "Coffee beans, tea and beverage stock used in sold products.",
    keywords: ["coffee", "blue tokai", "beans", "tea", "beverage", "roasters"],
  },
  {
    id: "cogs_packaging",
    label: "Packaging & Disposables",
    section: "COGS",
    treatment: "P_AND_L",
    description: "Packaging, cups, cutlery and disposables consumed with sold items.",
    keywords: ["packaging", "ecobox", "disposable", "cup", "cutlery", "container"],
  },
  {
    id: "cogs_platform_commissions",
    label: "Delivery Platform Commissions",
    section: "COGS",
    treatment: "P_AND_L",
    description: "Commission and platform fees taken by delivery marketplaces on orders sold through them.",
    keywords: ["uber eats", "swiggy", "zomato", "commission", "marketplace fee", "platform fee"],
  },
  {
    id: "cogs_other",
    label: "Other Cost of Sales",
    section: "COGS",
    treatment: "P_AND_L",
    description: "Other direct costs of delivering the product or service.",
    keywords: ["direct cost", "cost of sales", "freight in"],
  },
  {
    id: "payroll_wages",
    label: "Staff Wages & Salaries",
    section: "PAYROLL",
    treatment: "P_AND_L",
    description: "Gross wages and salaries paid to employees.",
    keywords: ["payroll", "wages", "salary", "salaries", "staff wages", "gusto"],
  },
  {
    id: "payroll_contractors",
    label: "Contract & Gig Labor",
    section: "PAYROLL",
    treatment: "P_AND_L",
    description: "Payments to contract workers, bakers and gig labor engaged for production or service.",
    keywords: ["contract", "contractor", "baker", "freelance", "gig"],
  },
  {
    id: "payroll_benefits",
    label: "Payroll Taxes & Benefits",
    section: "PAYROLL",
    treatment: "P_AND_L",
    description: "Employer payroll taxes, staff benefits and staff meals.",
    keywords: ["benefits", "staff meals", "payroll tax", "provident fund", "insurance - staff"],
  },
  {
    id: "opex_rent",
    label: "Rent & Facility",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Rent and facility costs for premises.",
    keywords: ["rent", "lease", "property", "landlord", "maintenance charge"],
  },
  {
    id: "opex_utilities",
    label: "Utilities",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Electricity, water, gas and similar utilities.",
    keywords: ["electricity", "water", "gas", "bescom", "bwssb", "utility", "sewerage"],
  },
  {
    id: "opex_marketing",
    label: "Marketing & Advertising",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Advertising campaigns, paid social, search ads and promotions.",
    keywords: ["ads", "meta", "google ads", "instagram", "promotion", "campaign", "marketing", "boost"],
  },
  {
    id: "opex_software",
    label: "Software & Subscriptions",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "SaaS tools, cloud hosting and software subscriptions used to run the business.",
    keywords: ["aws", "amazon web services", "saas", "software", "subscription - software", "toast pos", "hosting", "cloud"],
  },
  {
    id: "opex_insurance",
    label: "Insurance",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Business insurance premiums.",
    keywords: ["insurance", "premium", "ergo", "policy"],
  },
  {
    id: "opex_professional_fees",
    label: "Professional Fees",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Auditors, accountants, lawyers and consultants.",
    keywords: ["audit", "auditor", "ca ", "accountant", "legal", "consulting", "consultant", "advisory"],
  },
  {
    id: "opex_travel",
    label: "Travel & Local Transport",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Business travel, cabs and local delivery transport.",
    keywords: ["uber for business", "ola", "cab", "travel", "flight", "hotel", "fuel"],
  },
  {
    id: "opex_office",
    label: "Office Supplies & Equipment",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Consumable office supplies and small equipment not capitalised.",
    keywords: ["office supplies", "stationery", "amazon", "small equipment", "printer"],
  },
  {
    id: "opex_maintenance",
    label: "Repairs & Maintenance",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Repairs and servicing of equipment and premises.",
    keywords: ["repair", "service call", "maintenance", "servicing", "engineer"],
  },
  {
    id: "opex_bank_fees",
    label: "Bank Fees & Charges",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Bank service charges, wire fees and payment gateway charges.",
    keywords: ["bank service", "charge", "fee", "bank charges", "handling charge"],
  },
  {
    id: "opex_other",
    label: "Other Operating Expenses",
    section: "OPEX",
    treatment: "P_AND_L",
    description: "Operating costs that do not fit any other operating category.",
    keywords: ["sundry", "misc", "petty", "consumables"],
  },
  {
    id: "nonpl_transfer",
    label: "Internal Transfers",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Money moved between the company's own accounts or into deposits. Not an expense.",
    keywords: ["transfer to", "fixed deposit", "fd ", "sweep", "own account", "to savings"],
  },
  {
    id: "nonpl_loan_proceeds",
    label: "Loan Proceeds",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Borrowings received. Balance sheet liability, not revenue.",
    keywords: ["loan disbursement", "term loan", "borrowing", "drawdown"],
  },
  {
    id: "nonpl_loan_repayment",
    label: "Loan Repayment (EMI)",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Loan principal repayments. Principal is balance sheet; the interest portion is an expense and needs a split - flag for judgment.",
    keywords: ["loan emi", "emi", "principal repayment", "loan repayment"],
  },
  {
    id: "nonpl_capex",
    label: "Capital Purchase (Asset)",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Purchase of long-lived equipment or assets. Capitalised and depreciated, not an immediate expense.",
    keywords: ["purchase -", "equipment purchase", "oven", "machinery", "asset", "fit-out"],
  },
  {
    id: "nonpl_owner",
    label: "Owner Draws & Contributions",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Money taken out by or put in by the owner. Equity movement, not P&L.",
    keywords: ["owner drawing", "drawing", "dividend", "owner capital", "capital contribution"],
  },
  {
    id: "nonpl_tax",
    label: "Indirect Tax Remittance",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Payment of collected GST/VAT/sales tax to the government. Liability settlement, not an expense.",
    keywords: ["gst payment", "vat payment", "sales tax payment", "gst network", "tax remittance"],
  },
  {
    id: "nonpl_other",
    label: "Other Non-P&L Item",
    section: null,
    treatment: "NON_P_AND_L",
    description: "Items that likely require different accounting treatment than an income-statement line.",
    keywords: ["deposit", "security deposit", "escrow", "intercompany"],
  },
];

export const CATEGORIES: Category[] = SEED.map(
  ({ id, label, section, treatment, description, keywords }) => ({
    id,
    label,
    section,
    treatment,
    description,
    keywords,
  })
);

export const CATEGORY_MAP: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
);

export const CHART_OF_ACCOUNTS_JSON: Category[] = CATEGORIES;

export function isCategoryId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_MAP, id);
}

export function categoryLabel(id: string): string {
  return CATEGORY_MAP[id]?.label ?? id;
}

export const PNL_LINE_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cogs: "Cost of Goods Sold",
  grossProfit: "Gross Profit",
  payroll: "Payroll",
  opex: "Operating Expenses",
  operatingProfit: "Operating Profit",
};

export const SECTION_TO_LINE: Record<Section, string> = {
  REVENUE: "revenue",
  COGS: "cogs",
  PAYROLL: "payroll",
  OPEX: "opex",
};

export const SECTION_LINE_MEMBERSHIP: Record<string, Section[]> = {
  revenue: ["REVENUE"],
  cogs: ["COGS"],
  payroll: ["PAYROLL"],
  opex: ["OPEX"],
};

export const REVIEW_REASON_LABELS: Record<string, string> = {
  LOW_CONFIDENCE: "Low classification confidence",
  RULES_FALLBACK: "Classified by keyword rules, not AI",
  AI_FLAGGED: "AI asked for human review",
  TREATMENT_JUDGMENT: "Accounting treatment needs judgment",
  DUPLICATE: "Possible duplicate transaction",
  OUTLIER: "Unusual amount for this category",
  ROUND_NUMBER: "Suspicious round-number payment",
  OPAQUE_DESCRIPTION: "Opaque / hard-to-read description",
  BALANCE_MISMATCH: "Statement balance does not reconcile",
  UNUSUAL_INFLOW: "Unexplained inflow",
};
