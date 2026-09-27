import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "bank_transactions.csv");

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260226);
const range = (lo, hi) => lo + rnd() * (hi - lo);
const money = (v) => Math.round(v * 100) / 100;

const MONTHS = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

// Monthly story drivers used later for variance analysis
const STORY = {
  "2026-02": { sales: 1.0, food: 1.0, metaAds: 900, googleAds: 650, hires: 0, corporate: 1 },
  "2026-03": { sales: 1.14, food: 1.22, metaAds: 3200, googleAds: 2400, hires: 0, corporate: 1 },
  "2026-04": { sales: 1.18, food: 1.15, metaAds: 1400, googleAds: 800, hires: 2, corporate: 2 },
  "2026-05": { sales: 1.34, food: 1.28, metaAds: 950, googleAds: 750, hires: 2, corporate: 3 },
  "2026-06": { sales: 1.4, food: 1.25, metaAds: 1050, googleAds: 850, hires: 2, corporate: 3 },
  "2026-07": { sales: 1.36, food: 1.2, metaAds: 1000, googleAds: 800, hires: 2, corporate: 3 },
};

const CORPORATE_CLIENTS = ["INFOSYS CAMPUS PANTRY", "WIPRO FOODS INC", "CRED HQ", "SWIGGY OFFICE CAFE", "MICHELIN INDIA"];
const rows = [];
let refSeq = 0;
const ref = () => `TRX-${String(++refSeq).padStart(4, "0")}`;

function dayOf(month, d) {
  const dd = String(Math.min(d, 28)).padStart(2, "0");
  return `${month}-${dd}`;
}

function add(month, day, description, type, amount, counterparty) {
  rows.push({
    date: dayOf(month, day),
    description,
    debit: type === "debit" ? money(amount) : "",
    credit: type === "credit" ? money(amount) : "",
    counterparty,
    reference: ref(),
  });
}

for (const month of MONTHS) {
  const s = STORY[month];
  const mNum = Number(month.slice(5));
  const isOddMonth = mNum % 2 === 1;

  // ---------- Revenue: payment processor payouts (money in) ----------
  const payoutDays = [4, 9, 14, 18, 23, 27];
  for (const d of payoutDays) {
    add(month, d, `RAZORPAY PAYOUT - CARD SALES ${month}`, "credit", range(3900, 7400) * s.sales, "RAZORPAY PAYMENTS");
  }
  // Cash deposits from the counter till
  add(month, 7, "CASH DEPOSIT - COUNTER TILL", "credit", money(range(2400, 3900) * s.sales), "SELF - BRANCH CASH");
  add(month, 21, "CASH DEPOSIT - COUNTER TILL", "credit", money(range(2300, 3700) * s.sales), "SELF - BRANCH CASH");
  // Corporate / bulk orders
  for (let i = 0; i < s.corporate; i++) {
    const client = CORPORATE_CLIENTS[(mNum + i) % CORPORATE_CLIENTS.length];
    add(month, 11 + i * 5, `INVOICE PAYMENT - ${client}`, "credit", money(range(2600, 6400) * s.sales), client);
  }
  // Recurring subscription revenue (office pantry plans)
  add(month, 5, "OFFICE PANTRY SUBSCRIPTION - MONTHLY RENEWAL", "credit", 1850, "BEAN & BAKE SUBSCRIPTIONS");

  // ---------- COGS (money out) ----------
  add(month, 3, "SYSCO FOODS - INGREDIENTS", "debit", money(range(2100, 3300) * s.food), "SYSCO FOODS");
  add(month, 17, "SYSCO FOODS - INGREDIENTS", "debit", money(range(1900, 3100) * s.food), "SYSCO FOODS");
  add(month, 6, "METRO CASH & CARRY - GROCERY RUN", "debit", money(range(1200, 2200) * s.food), "METRO WHOLESALE");
  if (isOddMonth) add(month, 19, "METRO CASH & CARRY - GROCERY RUN", "debit", money(range(900, 1700) * s.food), "METRO WHOLESALE");
  add(month, 8, "BLUE TOKAI COFFEE ROASTERS", "debit", money(range(1050, 1650) * s.food), "BLUE TOKAI");
  if (isOddMonth) add(month, 24, "BLUE TOKAI COFFEE ROASTERS", "debit", money(range(850, 1400) * s.food), "BLUE TOKAI");
  add(month, 12, "ECOBOX PACKAGING SUPPLIES", "debit", money(range(420, 780) * s.food), "ECOBOX");
  add(month, 15, "UBER EATS COMMISSION", "debit", money(range(680, 1450) * s.sales), "UBER EATS");
  add(month, 26, "SWIGGY COMMISSION", "debit", money(range(620, 1280) * s.sales), "SWIGGY");

  // ---------- Payroll (money out) ----------
  add(month, 1, "PAYROLL - CAFE STAFF WAGES", "debit", s.hires > 0 ? range(12300, 12900) : range(9400, 10400), "GUSTO PAYROLL");
  add(month, 2, "PAYROLL - CONTRACT BAKERS", "debit", range(3700, 4700), "GUSTO PAYROLL");
  add(month, 10, "STAFF MEALS & BENEFITS", "debit", range(560, 940), "GUSTO PAYROLL");

  // ---------- Operating expenses (money out) ----------
  add(month, 3, "KORAMANGALA OFFICE RENT", "debit", 3200, "SRI LAKSHMI PROPERTIES");
  add(month, 9, "BESCOM ELECTRICITY BILL", "debit", range(430, 810), "BESCOM");
  add(month, 9, "BWSSB WATER BILL", "debit", range(170, 265), "BWSSB");
  add(month, 14, "HP GAS CYLINDER SUPPLY", "debit", range(205, 330), "HP GAS");
  add(month, 6, "META ADS - PAID SOCIAL CAMPAIGN", "debit", s.metaAds, "META PLATFORMS");
  add(month, 6, "GOOGLE ADS - SEARCH CAMPAIGN", "debit", s.googleAds, "GOOGLE");
  add(month, 20, "INSTAGRAM PROMO - REELS BOOST", "debit", range(280, 520), "META PLATFORMS");
  add(month, 13, "AMAZON WEB SERVICES", "debit", range(310, 490), "AMAZON WEB SERVICES");
  add(month, 13, "TOAST POS SUBSCRIPTION", "debit", 199, "TOAST INC");
  add(month, 16, "COMMERCIAL LIABILITY INSURANCE", "debit", 480, "HDFC ERGO");
  add(month, 18, "UBER FOR BUSINESS - DELIVERIES", "debit", range(230, 430), "UBER");
  add(month, 22, "OFFICE SUPPLIES - AMAZON", "debit", range(140, 390), "AMAZON");
  add(month, 28, "BANK SERVICE CHARGES", "debit", range(45, 88), "HDFC BANK");

  // ---------- Financing / owner / tax (non P&L) ----------
  if (month === "2026-02") add(month, 12, "LOAN DISBURSEMENT - HDFC TERM LOAN", "credit", 15000, "HDFC BANK");
  if (mNum >= 3) add(month, 15, "LOAN EMI - HDFC BUSINESS LOAN", "debit", 1450, "HDFC BANK");
  add(month, 25, "TRANSFER TO HDFC SAVINGS", "debit", 4000, "SELF - HDFC SAVINGS");
  add(month, 27, "OWNER DRAWING - JEEVA", "debit", range(2000, 3400), "JEEVA K");
  add(month, 20, "GST PAYMENT - KARNATAKA GOVT", "debit", range(2800, 4300), "GST NETWORK");
  if (month === "2026-04") add(month, 23, "FIXED DEPOSIT - HDFC FD 7182", "debit", 10000, "HDFC BANK");
  if (month === "2026-05") add(month, 19, "PURCHASE - COMMERCIAL OVEN - FALCON BAKERY EQUIPMENT", "debit", 8400, "FALCON BAKERY EQUIPMENT");

  // ---------- One-off / judgment-heavy items ----------
  if (month === "2026-02") add(month, 24, "PAYMENT TO M/S KRISHNA SUPPLIERS", "debit", 1950, "M/S KRISHNA SUPPLIERS");
  if (month === "2026-03") {
    add(month, 8, "META ADS - PAID SOCIAL CAMPAIGN", "debit", 3200, "META PLATFORMS");
    add(month, 10, "META ADS - PAID SOCIAL CAMPAIGN", "debit", 3200, "META PLATFORMS");
  }
  if (month === "2026-04") add(month, 11, "UPI//P2A/8837291/KKRNM", "debit", 750, "UPI P2A");
  if (month === "2026-05") add(month, 21, "CONSULTING FEE - GROWTH PARTNERS", "debit", 5000, "GROWTH PARTNERS LLP");
  if (month === "2026-06") {
    add(month, 16, "AUDIT & BOOKKEEPING - CA RAMESH", "debit", 2100, "CA RAMESH & ASSOCIATES");
    add(month, 24, "AMAZON - MIXED ORDER", "debit", 1240, "AMAZON");
    add(month, 30, "EQUIPMENT SERVICE - UNCLEAR VENDOR", "debit", 860, "VENDOR REF 8821");
  }
  if (month === "2026-07") {
    add(month, 14, "OVEN REPAIR - SERVICE CALL", "debit", 640, "FALCON SERVICE");
    add(month, 22, "UNKNOWN ACH CREDIT - REMITTANCE", "credit", 2500, "SENDER NOT IDENTIFIED");
  }
}

// Sort by date, compute running balance (with one intentional inconsistency)
rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
let balance = 85000;
for (const r of rows) {
  const signed = (r.credit ? r.credit : 0) - (r.debit ? r.debit : 0);
  balance = Math.round((balance + signed) * 100) / 100;
  r.balance = balance;
}
// Break the balance on one April row so the app can detect a data inconsistency
const breakIdx = rows.findIndex((r) => r.date.startsWith("2026-04") && r.debit && r.debit > 500);
if (breakIdx >= 0) rows[breakIdx].balance = Math.round((rows[breakIdx].balance + 1275.5) * 100) / 100;

const header = "Transaction Date,Description,Debit,Credit,Balance,Counterparty,Reference";
const lines = rows.map(
  (r) =>
    [
      r.date,
      `"${r.description.replaceAll('"', '""')}"`,
      r.debit === "" ? "" : r.debit.toFixed(2),
      r.credit === "" ? "" : r.credit.toFixed(2),
      r.balance.toFixed(2),
      `"${r.counterparty.replaceAll('"', '""')}"`,
      r.reference,
    ].join(",")
);

mkdirSync(join(__dirname, "..", "data"), { recursive: true });
writeFileSync(OUT, [header, ...lines].join("\n"), "utf8");

const totals = {};
for (const r of rows) {
  const m = r.date.slice(0, 7);
  totals[m] = totals[m] || { in: 0, out: 0, n: 0 };
  totals[m].in += r.credit || 0;
  totals[m].out += r.debit || 0;
  totals[m].n++;
}
console.log(`Wrote ${rows.length} rows to ${OUT}`);
for (const [m, t] of Object.entries(totals)) {
  console.log(`${m}: ${t.n} txns, in=${t.in.toFixed(2)}, out=${t.out.toFixed(2)}`);
}
