"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", hint: "Overview" },
  { href: "/ingest", label: "Ingest", hint: "Import & categorize" },
  { href: "/transactions", label: "Transactions", hint: "Classify & correct" },
  { href: "/pnl", label: "P&L", hint: "Monthly statements" },
  { href: "/variances", label: "Variances", hint: "What changed & why" },
  { href: "/review", label: "Review", hint: "Items needing judgment" },
  { href: "/analyst", label: "AI Analyst", hint: "Ask anything" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-slate-800/80 bg-[#080d1a] px-4 py-7 sticky top-0 h-screen hidden md:flex flex-col">
      <div className="px-2 mb-8">
        <div className="text-lg font-semibold tracking-tight text-white">
          FINZ
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mt-1">
          Financial Review
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-lg px-3 py-2.5 transition-colors ${
                active
                  ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent"
              }`}
            >
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-[11px] text-slate-500 group-hover:text-slate-400">
                {item.hint}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 text-[11px] leading-relaxed text-slate-600">
        Deterministic math, AI reasoning.
        <br />
        Every figure is traceable.
      </div>
    </aside>
  );
}
