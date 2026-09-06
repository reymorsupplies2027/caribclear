'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, fmtTTD, fmtUSD, fmtDate, fmtDateTime, daysUntil, SHIPMENT_STATUS_META } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Ship, FileText, ClipboardCheck, ReceiptText, Calculator, Clock } from 'lucide-react';
import { SHIPMENT_STATUSES } from '@/lib/engine/seed-data';
import { toast } from '@/hooks/use-toast';

interface Full {
  id: string; reference: string; status: string; mode: string; type: string;
  goodsDescription: string; carrier: string | null; vesselOrFlight: string | null;
  originPort: string | null; destinationPort: string | null; etd: string | null; eta: string | null;
  incoterm: string | null; fobUsd: number; freightUsd: number; insuranceUsd: number;
  demurrageFreeDays: number; demurragePerDayTtd: number; demurrageStartDate: string | null;
  client?: { name: string } | null;
  containers: { id: string; number: string; size: string; sealNumber: string | null }[];
  documents: { id: string; title: string; type: string; version: number; createdAt: string; expiryDate: string | null }[];
  permits: { id: string; title: string; status: string; authority: string | null; expiryDate: string | null }[];
  quotes: { id: string; number: string; type: string; status: string; total: number }[];
  costCalcs: { id: string; name: string; hsCode: string; totalTtd: number }[];
}

const PERMIT_COLOR: Record<string, string> = {
  approved: 'bg-emerald-600 text-white', submitted: 'bg-amber-500 text-slate-900',
  pending: 'bg-muted text-muted-foreground', rejected: 'bg-rose-600 text-white', not_required: 'bg-muted text-muted-foreground',
};

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<Full | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ shipment: Full }>(`/api/shipments/${id}`).catch(() => null);
    setS(data?.shipment ?? null);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string) {
    setSaving(true);
    try {
      await api(`/api/shipments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast({ title: 'Status updated', description: `Now: ${status.replace(/_/g, ' ')}` });
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  if (!s) return <p className="text-muted-foreground p-6">Loading shipment…</p>;

  const meta = SHIPMENT_STATUS_META[s.status];
  const currentIdx = SHIPMENT_STATUSES.findIndex(x => x.key === s.status);

  // Demurrage countdown
  let demurrage: { daysLeft: number; penaltyDays: number; penaltyTtd: number } | null = null;
  if (s.demurrageStartDate && s.status !== 'released') {
    const start = new Date(s.demurrageStartDate).getTime();
    const freeEnd = start + s.demurrageFreeDays * 86400000;
    const daysLeft = Math.ceil((freeEnd - Date.now()) / 86400000);
    const penaltyDays = daysLeft < 0 ? Math.abs(daysLeft) : 0;
    demurrage = { daysLeft: Math.max(0, daysLeft), penaltyDays, penaltyTtd: penaltyDays * s.demurragePerDayTtd };
  }

  const cifUsd = s.fobUsd + s.freightUsd + s.insuranceUsd;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{s.reference}</h1>
            <Badge variant="secondary">{s.mode === 'air' ? '✈ AIR' : '🚢 SEA'}</Badge>
            <Badge variant="outline">{s.type}</Badge>
            {s.incoterm && <Badge variant="outline">{s.incoterm}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{s.goodsDescription}</p>
        </div>
        <Select value={s.status} onValueChange={changeStatus} disabled={saving}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SHIPMENT_STATUSES.map(x => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-5 overflow-x-auto">
          <ol className="flex items-start min-w-[640px]">
            {SHIPMENT_STATUSES.map((st, i) => {
              const done = i <= currentIdx;
              const isNow = i === currentIdx;
              return (
                <li key={st.key} className="flex-1 relative">
                  <div className="flex items-center">
                    <div className={`h-8 w-8 rounded-full grid place-items-center shrink-0 text-xs font-bold border-2 transition-colors
                      ${done ? 'bg-teal-600 border-teal-600 text-white' : 'bg-background border-muted-foreground/30 text-muted-foreground'} ${isNow ? 'ring-4 ring-teal-600/20' : ''}`}>
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    {i < SHIPMENT_STATUSES.length - 1 && (
                      <div className={`flex-1 h-0.5 ${i < currentIdx ? 'bg-teal-600' : 'bg-muted-foreground/20'}`} />
                    )}
                  </div>
                  <p className={`mt-2 text-xs font-medium ${done ? 'text-foreground' : 'text-muted-foreground'}`}>{st.label}</p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Demurrage countdown */}
      {demurrage && (
        <Card className={demurrage.penaltyDays > 0 ? 'border-rose-500/50 bg-rose-500/5' : 'border-amber-500/50 bg-amber-500/5'}>
          <CardContent className="p-4 flex items-center gap-4">
            <Clock className={`h-8 w-8 ${demurrage.penaltyDays > 0 ? 'text-rose-600' : 'text-amber-500'}`} />
            <div>
              <p className="font-semibold">
                {demurrage.penaltyDays > 0
                  ? `Penalty zone: ${demurrage.penaltyDays} day(s) beyond free time`
                  : `${demurrage.daysLeft} free day(s) remaining`}
              </p>
              <p className="text-sm text-muted-foreground">
                {s.demurrageFreeDays} free days from {fmtDate(s.demurrageStartDate)} · penalty {fmtTTD(s.demurragePerDayTtd)}/day
                {demurrage.penaltyDays > 0 && ` · accrued so far: ${fmtTTD(demurrage.penaltyTtd)}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Route & cargo */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Ship className="h-5 w-5 text-teal-600" /> Route & cargo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Info label="Carrier" value={s.carrier ?? '—'} />
            <Info label="Vessel / flight" value={s.vesselOrFlight ?? '—'} />
            <Info label="Client" value={s.client?.name ?? '—'} />
            <Info label="Origin" value={s.originPort ?? '—'} />
            <Info label="Destination" value={s.destinationPort ?? '—'} />
            <Info label="ETD → ETA" value={`${fmtDate(s.etd)} → ${fmtDate(s.eta)}`} />
            <Info label="FOB" value={fmtUSD(s.fobUsd)} />
            <Info label="Freight" value={fmtUSD(s.freightUsd)} />
            <Info label="Insurance" value={fmtUSD(s.insuranceUsd)} />
          </CardContent>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground mb-1.5 mt-2">Containers ({s.containers.length})</p>
            <div className="flex flex-wrap gap-2">
              {s.containers.map(c => (
                <Badge key={c.id} variant="secondary" className="font-mono text-xs">{c.number} · {c.size}</Badge>
              ))}
              {s.containers.length === 0 && <span className="text-sm text-muted-foreground">No containers registered (LCL/air cargo).</span>}
            </div>
          </CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Related</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-muted-foreground">Cost calcs</span><span>{s.costCalcs.length}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Permits</span><span>{s.permits.length}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Documents</span><span>{s.documents.length}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Quotes/invoices</span><span>{s.quotes.length}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Documents + permits */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-teal-600" /> Documents</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.documents.map(d => {
              const dExp = daysUntil(d.expiryDate);
              return (
                <div key={d.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0">
                  <div className="min-w-0"><p className="font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">v{d.version} · {fmtDate(d.createdAt)}</p></div>
                  {dExp !== null && <Badge variant="secondary" className={dExp < 30 ? 'bg-amber-500/15 text-amber-700 border-0' : ''}>{dExp < 0 ? 'expired' : `${dExp}d`}</Badge>}
                </div>
              );
            })}
            {s.documents.length === 0 && <p className="text-sm text-muted-foreground">No documents yet — <a className="text-teal-600 hover:underline" href="/dashboard/documents">upload to vault</a>.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal-600" /> Permits</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.permits.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0">
                <div className="min-w-0"><p className="font-medium truncate">{p.title}</p><p className="text-xs text-muted-foreground">{p.authority}</p></div>
                <Badge className={`${PERMIT_COLOR[p.status] ?? 'bg-muted'} border-0 text-[10px] shrink-0`}>{p.status}</Badge>
              </div>
            ))}
            {s.permits.length === 0 && <p className="text-sm text-muted-foreground">No permits attached — check the <a className="text-teal-600 hover:underline" href="/dashboard/permits">matrix</a>.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Quotes + costs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><ReceiptText className="h-5 w-5 text-teal-600" /> Quotes & invoices</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.quotes.map(q => (
              <div key={q.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{q.number} <span className="text-muted-foreground font-normal">({q.type})</span></span>
                <span className="flex items-center gap-2"><span className="font-semibold">{fmtTTD(q.total)}</span><Badge variant="secondary" className="text-[10px]">{q.status}</Badge></span>
              </div>
            ))}
            {s.quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet — <a className="text-teal-600 hover:underline" href="/dashboard/quotes">create one</a>.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Calculator className="h-5 w-5 text-teal-600" /> Landed costs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.costCalcs.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span className="font-mono text-xs">{c.hsCode}</span>
                <span className="font-semibold">{fmtTTD(c.totalTtd)}</span>
              </div>
            ))}
            {s.costCalcs.length === 0 && <p className="text-sm text-muted-foreground">No calculations yet — run the <a className="text-teal-600 hover:underline" href="/dashboard/calculator">cost engine</a>.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
