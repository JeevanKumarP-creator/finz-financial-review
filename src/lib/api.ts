export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function money(cents: number, opts: { sign?: boolean } = {}): string {
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!opts.sign) return cents < 0 ? `-${s}` : s;
  return `${cents < 0 ? "-" : "+"}${s}`;
}

export function compactMoney(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx > 11) return month;
  return `${MONTHS[idx]} ${y}`;
}

export function pct(value: number | null, opts: { sign?: boolean } = {}): string {
  if (value == null) return "n/a";
  const s = `${Math.abs(value).toFixed(1)}%`;
  if (!opts.sign) return `${value < 0 ? "-" : ""}${s}`;
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${s}`;
}

export function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return "text-emerald-400";
  if (confidence >= 0.7) return "text-amber-400";
  return "text-rose-400";
}
