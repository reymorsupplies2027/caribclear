'use client';

/** Client-side API helper + format utilities (TTD, dates, statuses). */

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({ success: false, error: { code: 'PARSE', message: 'Bad response' } }))) as ApiEnvelope<T>;
  if (!json.success || json.data === undefined) {
    throw Object.assign(new Error(json.error?.message || 'Request failed'), { code: json.error?.code, status: res.status });
  }
  return json.data;
}

export const fmtTTD = (n: number | null | undefined): string =>
  `TT$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUSD = (n: number | null | undefined): string =>
  `US$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (d: string | Date | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d: string | Date | null | undefined): string =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const daysUntil = (d: string | Date | null | undefined): number | null =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

export const SHIPMENT_STATUS_META: Record<string, { label: string; pct: number; color: string }> = {
  order_placed: { label: 'Order placed', pct: 10, color: 'bg-slate-500' },
  sailed: { label: 'Sailed', pct: 25, color: 'bg-sky-600' },
  in_transit: { label: 'In transit', pct: 45, color: 'bg-teal-600' },
  arrived: { label: 'Arrived', pct: 65, color: 'bg-amber-500' },
  unloaded: { label: 'Discharged', pct: 80, color: 'bg-orange-600' },
  in_customs: { label: 'In customs', pct: 92, color: 'bg-rose-600' },
  released: { label: 'Released', pct: 100, color: 'bg-emerald-600' },
};

export const ROLE_HOME: Record<string, string> = {
  super_admin: '/admin',
  broker_admin: '/dashboard',
  operator: '/dashboard',
  importer: '/portal',
};
