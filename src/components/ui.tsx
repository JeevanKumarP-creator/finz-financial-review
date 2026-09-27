import type { ReactNode } from "react";
import { money } from "@/lib/api";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Money({
  cents,
  sign = false,
  tone = true,
  className = "",
}: {
  cents: number;
  sign?: boolean;
  tone?: boolean;
  className?: string;
}) {
  const color =
    tone && sign ? (cents > 0 ? "text-emerald-400" : cents < 0 ? "text-rose-400" : "") : "";
  return (
    <span className={`num ${color} ${className}`}>
      {money(cents, { sign })}
    </span>
  );
}

export function Badge({
  children,
  color = "slate",
  title,
}: {
  children: ReactNode;
  color?: "slate" | "sky" | "emerald" | "amber" | "rose" | "violet";
  title?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800/80 text-slate-300 border-slate-700",
    sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[color]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-600 border-t-sky-400 animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Panel className="text-center py-12">
      <div className="text-base font-medium text-white">{title}</div>
      <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Panel>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-sky-500 hover:bg-sky-400 text-white border-sky-500",
    secondary:
      "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700",
    ghost:
      "bg-transparent hover:bg-slate-800/70 text-slate-300 border-slate-700",
    danger: "bg-rose-600/90 hover:bg-rose-500 text-white border-rose-600",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
