'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardCheck, ExternalLink, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Requirement { id: string; category: string; title: string; authority: string; description: string | null; hsPrefixes: string | null; bizLinkUrl: string | null }
interface ShipmentLite { id: string; reference: string; goodsDescription: string }
interface ShipmentPermit { id: string; shipmentId: string; title: string; status: string; expiryDate: string | null }

const CATEGORY_META: Record<string, { label: string; tone: string }> = {
  cfo_agro: { label: 'CFO / Agro', tone: 'bg-emerald-600/10 text-emerald-700' },
  ttbs: { label: 'TTBS Standards', tone: 'bg-teal-600/10 text-teal-700' },
  ema_cec: { label: 'EMA / CEC', tone: 'bg-amber-500/10 text-amber-700' },
  drug_inspectorate: { label: 'Drug Inspectorate', tone: 'bg-rose-600/10 text-rose-700' },
  chemicals: { label: 'Chemicals', tone: 'bg-orange-600/10 text-orange-700' },
  other: { label: 'Vehicles / Other', tone: 'bg-slate-600/10 text-slate-700' },
};
const STATUS_TONE: Record<string, string> = {
  approved: 'bg-emerald-600 text-white', submitted: 'bg-amber-500 text-slate-900',
  pending: 'bg-muted', rejected: 'bg-rose-600 text-white', not_required: 'bg-muted',
};

export default function PermitsPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [permitsByShipment, setPermitsByShipment] = useState<Record<string, ShipmentPermit[]>>({});
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ requirements: Requirement[] }>('/api/permits').catch(() => ({ requirements: [] }));
    setRequirements(r.requirements);
    const s = await api<{ shipments: ShipmentLite[] }>('/api/shipments').catch(() => ({ shipments: [] }));
    setShipments(s.shipments.slice(0, 8));
    const map: Record<string, ShipmentPermit[]> = {};
    await Promise.all(s.shipments.slice(0, 8).map(async sh => {
      const d = await api<{ shipmentPermits: ShipmentPermit[] }>(`/api/permits?shipmentId=${sh.id}`).catch(() => null);
      map[sh.id] = d?.shipmentPermits ?? [];
    }));
    setPermitsByShipment(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    await api('/api/permits', { method: 'PATCH', body: JSON.stringify({ id, status }) }).catch(() => null);
    load();
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">T&T permits matrix</h1>
          <p className="text-sm text-muted-foreground">Who needs what, per authority — guided via TTBizLink. Attach rules to shipments as checklists.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700"><Plus className="h-4 w-4 mr-1" /> Attach to shipment</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <AttachForm shipments={shipments} requirements={requirements} onDone={() => { setAddOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Matrix */}
      <div className="grid gap-3 md:grid-cols-2">
        {requirements.map(r => (
          <Card key={r.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <Badge className={`${CATEGORY_META[r.category]?.tone ?? 'bg-muted'} border-0`}>{CATEGORY_META[r.category]?.label ?? r.category}</Badge>
                {r.bizLinkUrl && (
                  <a href={r.bizLinkUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-600 flex items-center gap-1 hover:underline">
                    TTBizLink <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <CardTitle className="text-base mt-2">{r.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{r.authority}</p>
              <p className="text-sm mt-2 text-muted-foreground">{r.description}</p>
              {r.hsPrefixes && (
                <p className="text-[11px] mt-2 font-mono text-muted-foreground">HS triggers: {r.hsPrefixes.split(',').slice(0, 8).join(' · ')}{r.hsPrefixes.split(',').length > 8 ? ' …' : ''}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-shipment checklists */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Per-shipment checklists</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {shipments.map(sh => (
            <div key={sh.id}>
              <p className="font-semibold text-sm mb-2">{sh.reference} <span className="text-muted-foreground font-normal">— {sh.goodsDescription.slice(0, 70)}</span></p>
              <div className="flex flex-wrap gap-2">
                {(permitsByShipment[sh.id] ?? []).map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
                    <span className="font-medium">{p.title.length > 34 ? `${p.title.slice(0, 34)}…` : p.title}</span>
                    {p.expiryDate && <span className="text-muted-foreground">{fmtDate(p.expiryDate)}</span>}
                    <select value={p.status} onChange={e => setStatus(p.id, e.target.value)}
                      className={`rounded px-1.5 py-0.5 text-[10px] border-0 cursor-pointer ${STATUS_TONE[p.status] ?? 'bg-muted'}`} aria-label={`Status of ${p.title}`}>
                      {['not_required', 'pending', 'submitted', 'approved', 'rejected'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
                {(permitsByShipment[sh.id] ?? []).length === 0 && <span className="text-xs text-muted-foreground">No permits attached — use “Attach to shipment”.</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AttachForm({ shipments, requirements, onDone }: { shipments: ShipmentLite[]; requirements: Requirement[]; onDone: () => void }) {
  const [shipmentId, setShipmentId] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/permits', { method: 'POST', body: JSON.stringify({ shipmentId, requirementId }) });
      toast({ title: 'Permit attached', description: 'Track its status right here.' });
      onDone();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>Attach permit requirement</DialogTitle></DialogHeader>
      <div className="space-y-1.5"><Label>Shipment</Label>
        <Select value={shipmentId} onValueChange={setShipmentId}>
          <SelectTrigger><SelectValue placeholder="Choose shipment" /></SelectTrigger>
          <SelectContent>{shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.reference}</SelectItem>)}</SelectContent>
        </Select></div>
      <div className="space-y-1.5"><Label>Requirement</Label>
        <Select value={requirementId} onValueChange={setRequirementId}>
          <SelectTrigger><SelectValue placeholder="Choose requirement" /></SelectTrigger>
          <SelectContent>{requirements.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
        </Select></div>
      <DialogFooter><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={busy || !shipmentId || !requirementId}>Attach</Button></DialogFooter>
    </form>
  );
}

void ClipboardCheck;
