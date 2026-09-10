'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fmtDateTime, fmtTTD } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Printer, Loader2, BarChart3, Timer, ShieldCheck, FileText } from 'lucide-react';

/**
 * Reports Center — premium printable reports, 100% real tenant data:
 *  1. Executive trade report (period KPIs, status pipeline, top clients/HS)
 *  2. Demurrage exposure report (who is burning money at the port right now)
 *  3. Landed-cost certificate (premium breakdown with legal instruments)
 */

interface Summary {
  tenantName: string;
  periodDays: number;
  since: string;
  generatedAt: string;
  shipmentsCount: number;
  byStatus: Record<string, number>;
  cifTtd: number;
  dutiesTtd: number;
  taxesTotalTtd: number;
  calcCount: number;
  documentsCount: number;
  quotesCount: number;
  quotesApprovedCount: number;
  quotesTotalTtd: number;
  totalGrossKg: number;
  demurrageExposureTtd: number;
  demurrageRows: Array<{ reference: string; client: string; daysLate: number; freeDays: number; perDayTtd: number; exposureTtd: number; status: string; startDate: string | null }>;
  topClients: Array<{ name: string; cifTtd: number; count: number }>;
  topHs: Array<{ code: string; count: number; totalTtd: number }>;
}

interface CertLine { key: string; label: string; basis: string; amount: number; kind: string }
interface Certificate {
  id: string; name: string; hsCode: string; mode: string;
  fobUsd: number; freightUsd: number; insuranceUsd: number; exchangeRate: number;
  cifTtd: number; totalTtd: number;
  breakdown: { lines: CertLine[]; warnings: string[]; vehicleConcession?: { regime: string; instruments: string[] } } | null;
  createdAt: string;
  shipment: { reference: string; goodsDescription: string; client: { name: string; company: string } | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  order_placed: 'Order placed', sailed: 'Sailed', in_transit: 'In transit', arrived: 'Arrived',
  unloaded: 'Discharged', in_customs: 'In customs', released: 'Released', closed: 'Closed',
};

export default function ReportsPage() {
  const [days, setDays] = useState(90);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [calcList, setCalcList] = useState<Array<{ id: string; name: string; hsCode: string; totalTtd: number; createdAt: string }>>([]);
  const [calcId, setCalcId] = useState('');
  const [cert, setCert] = useState<Certificate | null>(null);
  const [view, setView] = useState<'menu' | 'executive' | 'demurrage' | 'certificate'>('menu');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ summary: Summary }>(`/api/reports/summary?days=${days}`);
      setSummary(d.summary);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ calcs: Array<{ id: string; name: string; hsCode: string; totalTtd: number; createdAt: string }> }>('/api/costs')
      .then((d) => setCalcList((d.calcs || []).slice(0, 50)))
      .catch(() => setCalcList([]));
  }, []);
  useEffect(() => {
    if (!calcId) { setCert(null); return; }
    api<{ certificate: Certificate }>(`/api/reports/summary?kind=certificate&calcId=${encodeURIComponent(calcId)}`)
      .then((d) => setCert(d.certificate))
      .catch(() => setCert(null));
  }, [calcId]);

  const REPORTS = [
    { id: 'executive' as const, title: 'Executive trade report', desc: 'Period KPIs, pipeline by status, top clients and HS lines — boardroom-ready.', icon: BarChart3, needs: !!summary },
    { id: 'demurrage' as const, title: 'Demurrage exposure', desc: 'Cargo sitting past free days, TT$ burning per day, ranked by exposure.', icon: Timer, needs: !!summary },
    { id: 'certificate' as const, title: 'Landed-cost certificate', desc: 'Premium breakdown of one calculation with legal instruments cited.', icon: ShieldCheck, needs: calcList.length > 0 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="no-print space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-teal-600" /> Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">Premium reports built from your live data — print or save as PDF for clients and management.</p>
          </div>
          {view !== 'menu' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print / Save PDF</Button>
              <Button variant="outline" onClick={() => setView('menu')}>← All reports</Button>
            </div>
          )}
        </header>

        {view === 'menu' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              {[30, 90, 365].map((d) => (
                <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}
                  className={cn(days === d && 'bg-teal-600 hover:bg-teal-700')}>{d === 365 ? '1 year' : `${d} days`}</Button>
              ))}
              {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {REPORTS.map((r) => (
                <button key={r.id} disabled={!r.needs} onClick={() => setView(r.id)}
                  className="text-left rounded-xl border bg-card p-4 hover:border-teal-500/60 hover:bg-muted/40 transition-colors disabled:opacity-40">
                  <r.icon className="h-6 w-6 text-teal-600" />
                  <div className="font-semibold mt-2">{r.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{r.desc}</div>
                </button>
              ))}
            </div>
            {view === 'menu' && calcList.length === 0 && (
              <p className="text-xs text-muted-foreground">Tip: the landed-cost certificate needs at least one saved calculation — run the Cost engine first.</p>
            )}
          </>
        )}

        {view === 'certificate' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Calculation</label>
            <select value={calcId} onChange={(e) => setCalcId(e.target.value)}
              className="w-full max-w-md rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">Select a saved calculation…</option>
              {calcList.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · HS {c.hsCode} · {fmtTTD(c.totalTtd)} · {fmtDate(c.createdAt)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Print sheets */}
      <div className="print-area mt-6">
        {view === 'executive' && summary && <ExecutiveSheet s={summary} />}
        {view === 'demurrage' && summary && <DemurrageSheet s={summary} />}
        {view === 'certificate' && cert && <CertificateSheet c={cert} tenantName={summary?.tenantName || ''} />}
      </div>
    </div>
  );
}

function ReportHead({ title, subtitle, tenantName, generatedAt }: { title: string; subtitle: string; tenantName: string; generatedAt: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b-2 border-teal-700 pb-3 mb-2">
        <div>
          <div className="font-bold text-lg tracking-tight text-teal-900">{tenantName || 'CaribClear'} — Foreign Trade Operations</div>
          <div className="text-[10px] uppercase tracking-widest text-teal-700 font-semibold">{title}</div>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          <div className="font-semibold text-slate-800">Generated {fmtDateTime(generatedAt)}</div>
          <div>CaribClear · caribclear.vercel.app</div>
        </div>
      </div>
      <p className="text-xs text-slate-600 mb-3">{subtitle}</p>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="report-kpi">
      <div className="text-[9px] uppercase tracking-wide text-slate-600 font-semibold">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
    </div>
  );
}

function ExecutiveSheet({ s }: { s: Summary }) {
  const statusEntries = Object.entries(s.byStatus).sort((a, b) => b[1] - a[1]);
  return (
    <div className="print-sheet report-sheet rounded-xl">
      <ReportHead title="Executive Trade Report" subtitle={`Consolidated performance over the last ${s.periodDays} days (since ${fmtDate(s.since)}). All figures in TT$ from live shipment and calculation data.`}
        tenantName={s.tenantName} generatedAt={s.generatedAt} />
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Kpi label="Shipments" value={String(s.shipmentsCount)} sub={`${s.totalGrossKg.toLocaleString('en-US')} kg gross`} />
        <Kpi label="Total CIF" value={fmtTTD(s.cifTtd)} sub="declared value base" />
        <Kpi label="Duties (CET/MVT/Excise)" value={fmtTTD(s.dutiesTtd)} sub="from saved calculations" />
        <Kpi label="Demurrage exposure" value={fmtTTD(s.demurrageExposureTtd)} sub="cargo past free days" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="report-band text-xs mb-1">PIPELINE BY STATUS</div>
          <table>
            <tbody>
              {statusEntries.map(([st, n]) => (
                <tr key={st}>
                  <td className="doc-cell">{STATUS_LABELS[st] || st}</td>
                  <td className="doc-cell text-right font-bold w-20">{n}</td>
                </tr>
              ))}
              {!statusEntries.length && <tr><td className="doc-cell text-slate-500">No shipments in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <div className="report-band text-xs mb-1">TOP CLIENTS BY CIF</div>
          <table>
            <tbody>
              {s.topClients.map((c) => (
                <tr key={c.name}>
                  <td className="doc-cell">{c.name} <span className="text-slate-500">({c.count})</span></td>
                  <td className="doc-cell text-right font-bold w-28">{fmtTTD(c.cifTtd)}</td>
                </tr>
              ))}
              {!s.topClients.length && <tr><td className="doc-cell text-slate-500">No client activity in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3">
        <div className="report-band text-xs mb-1">TOP HS LINES BY LANDED VALUE</div>
        <table>
          <tbody>
            {s.topHs.map((h) => (
              <tr key={h.code}>
                <td className="doc-cell w-28 font-bold">{h.code}</td>
                <td className="doc-cell">{h.count} calculation(s)</td>
                <td className="doc-cell text-right font-bold w-32">{fmtTTD(h.totalTtd)}</td>
              </tr>
            ))}
            {!s.topHs.length && <tr><td className="doc-cell text-slate-500">No calculations in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        <Kpi label="Vault documents" value={String(s.documentsCount)} sub="current versions" />
        <Kpi label="Cost runs" value={String(s.calcCount)} sub="this period" />
        <Kpi label="Quotes & invoices" value={String(s.quotesCount)} sub={`${s.quotesApprovedCount} approved/paid`} />
        <Kpi label="Fee revenue billed" value={fmtTTD(s.quotesTotalTtd)} sub="quotes + invoices" />
      </div>
      <p className="mt-3 text-[8.5px] text-slate-500 border-t pt-2">Confidential — prepared with CaribClear. Figures aggregate your own operational records; duties reflect saved landed-cost runs (CET/MVT/excise as configured on each run date).</p>
    </div>
  );
}

function DemurrageSheet({ s }: { s: Summary }) {
  return (
    <div className="print-sheet report-sheet rounded-xl">
      <ReportHead title="Demurrage Exposure Report" subtitle={`Containers past their free days, ranked by money at risk. Free days and per-day rates come from each shipment's tariff snapshot (e.g. PLIPDECO: 8 free days, TT$500/day).`}
        tenantName={s.tenantName} generatedAt={s.generatedAt} />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Kpi label="Total exposure" value={fmtTTD(s.demurrageExposureTtd)} sub="accrued, not yet released" />
        <Kpi label="Shipments at port" value={String(s.demurrageRows.length)} sub="active demurrage positions" />
      </div>
      <table>
        <thead>
          <tr className="text-left">
            <th className="doc-cell">Shipment</th>
            <th className="doc-cell">Client</th>
            <th className="doc-cell">Status</th>
            <th className="doc-cell">Start</th>
            <th className="doc-cell text-right">Free days</th>
            <th className="doc-cell text-right">Days late</th>
            <th className="doc-cell text-right">Per day</th>
            <th className="doc-cell text-right">Exposure</th>
          </tr>
        </thead>
        <tbody>
          {s.demurrageRows.map((r) => (
            <tr key={r.reference}>
              <td className="doc-cell font-bold">{r.reference}</td>
              <td className="doc-cell">{r.client}</td>
              <td className="doc-cell">{STATUS_LABELS[r.status] || r.status}</td>
              <td className="doc-cell">{fmtDate(r.startDate)}</td>
              <td className="doc-cell text-right">{r.freeDays}</td>
              <td className="doc-cell text-right font-bold">{r.daysLate}</td>
              <td className="doc-cell text-right">{fmtTTD(r.perDayTtd)}</td>
              <td className={cn('doc-cell text-right font-bold', r.exposureTtd > 0 && 'text-red-700')}>{fmtTTD(r.exposureTtd)}</td>
            </tr>
          ))}
          {!s.demurrageRows.length && (
            <tr><td className="doc-cell text-slate-500" colSpan={8}>No demurrage exposure in this period — cargo is moving within free days. Keep it that way.</td></tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[8.5px] text-slate-500 border-t pt-2">Confidential — prepared with CaribClear. Exposure = days beyond free time × per-day rate on record. Release or renew storage promptly: rates escalate and storage compounds separately.</p>
    </div>
  );
}

function CertificateSheet({ c, tenantName }: { c: Certificate; tenantName: string }) {
  const lines = c.breakdown?.lines || [];
  const taxes = lines.filter((l) => l.kind === 'tax' || l.kind === 'fee');
  return (
    <div className="print-sheet report-sheet rounded-xl">
      <ReportHead title="Landed Cost Certificate" subtitle={`Full duty & tax breakdown with the legal basis of every line — attach to quotes, client files or audit packs.`}
        tenantName={tenantName} generatedAt={c.createdAt} />
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Kpi label="Calculation" value={c.name} sub={`HS ${c.hsCode} · ${c.mode}`} />
        <Kpi label="CIF (TT$)" value={fmtTTD(c.cifTtd)} sub={`FX TT$${c.exchangeRate}/USD`} />
        <Kpi label="Total landed (TT$)" value={fmtTTD(c.totalTtd)} sub={`${(((c.totalTtd - c.cifTtd) / (c.cifTtd || 1)) * 100).toFixed(1)}% over CIF`} />
        <Kpi label="Shipment" value={c.shipment?.reference || '—'} sub={c.shipment?.client?.company || c.shipment?.client?.name || ''} />
      </div>
      <table>
        <thead>
          <tr className="text-left">
            <th className="doc-cell w-1/3">Concept</th>
            <th className="doc-cell">Legal / arithmetic basis</th>
            <th className="doc-cell text-right w-32">Amount (TT$)</th>
          </tr>
        </thead>
        <tbody>
          {taxes.map((l) => (
            <tr key={l.key}>
              <td className="doc-cell font-bold">{l.label}</td>
              <td className="doc-cell">{l.basis}</td>
              <td className="doc-cell text-right font-bold">{fmtTTD(l.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="doc-cell font-bold" colSpan={2}>TOTAL LANDED COST</td>
            <td className="doc-cell text-right font-bold text-teal-900">{fmtTTD(c.totalTtd)}</td>
          </tr>
        </tbody>
      </table>
      {c.breakdown?.vehicleConcession && (
        <div className="mt-3">
          <div className="report-band text-xs mb-1">LEGAL REGIME APPLIED — {c.breakdown.vehicleConcession.regime.replace(/_/g, ' ').toUpperCase()}</div>
          <ul className="text-xs list-disc pl-5">
            {c.breakdown.vehicleConcession.instruments.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
      )}
      {c.breakdown?.warnings && c.breakdown.warnings.length > 0 && (
        <div className="mt-3">
          <div className="report-band text-xs mb-1">NOTES</div>
          <ul className="text-xs list-disc pl-5">
            {c.breakdown.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="doc-cell">
          <span className="doc-label">Prepared by</span>
          <p className="mt-4 text-[10px] text-slate-600">{tenantName || '............................'}<br />Signature: ...........................................<br />Date: ...........................</p>
        </div>
        <div className="doc-cell">
          <span className="doc-label">Accepted by importer</span>
          <p className="mt-4 text-[10px] text-slate-600">Name: ............................<br />Signature: ...........................................<br />Date: ...........................</p>
        </div>
      </div>
      <p className="mt-3 text-[8.5px] text-slate-500 border-t pt-2">Confidential — prepared with CaribClear. Rate config snapshot version {String((c as { configVersion?: { version?: string } }).configVersion?.version ?? 'on-calculation-date')}; duties assessed by Customs govern final payment.</p>
    </div>
  );
}
