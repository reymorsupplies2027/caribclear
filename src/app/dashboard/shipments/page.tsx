'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtUSD, fmtDate, SHIPMENT_STATUS_META } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Ship } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Shipment {
  id: string; reference: string; status: string; mode: string; type: string;
  goodsDescription: string; eta: string | null; etd: string | null;
  fobUsd: number; freightUsd: number; insuranceUsd: number;
  demurrageStartDate: string | null; demurrageFreeDays: number;
  client?: { name: string } | null; containers: { id: string }[]; documents: { id: string }[];
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    const data = await api<{ shipments: Shipment[] }>(`/api/shipments?${params}`).catch(() => ({ shipments: [] }));
    setShipments(data.shipments);
  }, [q, status]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shipments</h1>
          <p className="text-sm text-muted-foreground">Track every shipment from order to release.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700"><Plus className="h-4 w-4 mr-1" /> New shipment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <CreateForm onCreated={() => { setCreateOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search reference, goods, carrier, client…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All states</option>
          {Object.entries(SHIPMENT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : shipments.length === 0 ? (
        <Card><CardContent className="text-center py-14 text-muted-foreground">
          <Ship className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="mb-3">Nothing here yet — create your first shipment.</p>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New shipment</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {shipments.map(s => {
            const meta = SHIPMENT_STATUS_META[s.status];
            let demurrageBadge: string | null = null;
            if (s.demurrageStartDate && s.status !== 'released') {
              const freeEnd = new Date(s.demurrageStartDate).getTime() + s.demurrageFreeDays * 86400000;
              const daysLeft = Math.ceil((freeEnd - Date.now()) / 86400000);
              if (daysLeft < 0) demurrageBadge = `⚠️ penalty ${Math.abs(daysLeft)}d`;
              else if (daysLeft <= 3) demurrageBadge = `⏳ ${daysLeft}d free left`;
            }
            return (
              <Link key={s.id} href={`/dashboard/shipments/${s.id}`}>
                <Card className="hover:border-teal-600/40 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{s.reference}</span>
                        <Badge variant="secondary" className="text-[10px]">{s.mode === 'air' ? '✈ AIR' : '🚢 SEA'}</Badge>
                        {demurrageBadge && <Badge className="bg-amber-500 text-slate-900 border-0 text-[10px]">{demurrageBadge}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{s.goodsDescription}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.client ? `${s.client.name} · ` : ''}{s.containers.length} container(s) · {s.documents.length} doc(s) · {fmtUSD(s.fobUsd + s.freightUsd + s.insuranceUsd)} CIF
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={`${meta.color} text-white border-0`}>{meta.label}</Badge>
                      <p className="text-xs text-muted-foreground mt-1.5">ETA {fmtDate(s.eta)}</p>
                      <div className="mt-1.5 w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${meta.color}`} style={{ width: `${meta.pct}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    goodsDescription: '', mode: 'sea', type: 'import', clientId: '',
    carrier: '', vesselOrFlight: '', originPort: '', destinationPort: '',
    etd: '', eta: '', incoterm: 'FOB', fobUsd: '', freightUsd: '', insuranceUsd: '',
    demurrageFreeDays: '5', demurragePerDayTtd: '350', demurrageStartDate: '',
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/api/shipments', { method: 'POST', body: JSON.stringify(f) });
      toast({ title: 'Shipment created', description: 'The tracking timeline is live.' });
      onCreated();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  const input = (k: string, label: string, opts?: { type?: string; ph?: string; required?: boolean }) => (
    <div className="space-y-1">
      <Label htmlFor={`c-${k}`}>{label}</Label>
      <Input id={`c-${k}`} type={opts?.type || 'text'} placeholder={opts?.ph} required={opts?.required} value={f[k]} onChange={set(k)} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>New shipment</DialogTitle></DialogHeader>
      <div className="space-y-1">
        <Label htmlFor="c-goods">Goods description *</Label>
        <textarea id="c-goods" required rows={2} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" placeholder="Frozen vegetables and processed foods (HS 0710/1905)" value={f.goodsDescription} onChange={set('goodsDescription')} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label htmlFor="c-mode">Mode</Label>
          <select id="c-mode" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={f.mode} onChange={set('mode')}>
            <option value="sea">Sea</option><option value="air">Air</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-type">Flow</Label>
          <select id="c-type" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={f.type} onChange={set('type')}>
            <option value="import">Import</option><option value="export">Export</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-incoterm">Incoterm</Label>
          <select id="c-incoterm" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={f.incoterm} onChange={set('incoterm')}>
            {['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'DDP', 'CIP'].map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-carrier">Carrier</Label>
          <Input id="c-carrier" placeholder="Maersk" value={f.carrier} onChange={set('carrier')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {input('vesselOrFlight', 'Vessel / flight', { ph: 'ALGOL / 22W12' })}
        {input('originPort', 'Origin port', { ph: 'Miami, US' })}
        {input('destinationPort', 'Destination port', { ph: 'Port of Spain, TT' })}
        {input('etd', 'ETD', { type: 'date' })}
        {input('eta', 'ETA', { type: 'date' })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {input('fobUsd', 'FOB (USD)', { type: 'number', ph: '0.00' })}
        {input('freightUsd', 'Freight (USD)', { type: 'number', ph: '0.00' })}
        {input('insuranceUsd', 'Insurance (USD)', { type: 'number', ph: '0.00' })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {input('demurrageFreeDays', 'Free days', { type: 'number' })}
        {input('demurragePerDayTtd', 'Penalty TT$/day', { type: 'number' })}
        {input('demurrageStartDate', 'Demurrage from', { type: 'date' })}
      </div>
      <DialogFooter>
        <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={saving}>
          {saving && <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
          Create shipment
        </Button>
      </DialogFooter>
    </form>
  );
}

void fmtTTD;
