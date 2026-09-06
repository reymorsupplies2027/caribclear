'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtTTD, fmtDate } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ReceiptText, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Item { kind: 'fee' | 'disbursement'; description: string; amount: string }
interface Quote {
  id: string; number: string; type: string; status: string; feesTotal: number; disbursementsTotal: number;
  vatRate: number; vatTotal: number; total: number; validUntil: string | null; dueDate: string | null;
  itemsJson: string; client?: { name: string } | null; shipment?: { reference: string } | null; createdAt: string;
}
interface ClientLite { id: string; name: string }
interface ShipmentLite { id: string; reference: string }

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', sent: 'bg-amber-500 text-slate-900',
  approved: 'bg-teal-600 text-white', rejected: 'bg-rose-600 text-white', paid: 'bg-emerald-600 text-white',
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([{ kind: 'fee', description: 'Broker professional fee', amount: '' }]);

  const load = useCallback(async () => {
    const data = await api<{ quotes: Quote[] }>('/api/quotes').catch(() => ({ quotes: [] }));
    setQuotes(data.quotes);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    try {
      await api('/api/quotes', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      toast({ title: status === 'sent' ? 'Sent to client' : `Marked ${status}` });
      load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  const totals = items.reduce((acc, i) => {
    const amt = Number(i.amount) || 0;
    if (i.kind === 'fee') acc.fees += amt; else acc.disb += amt;
    return acc;
  }, { fees: 0, disb: 0 });
  const vat = totals.fees * 0.125;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quotes & invoices</h1>
          <p className="text-sm text-muted-foreground">Honorarios + disbursements + VAT 12.5% — approved by clients in the portal.</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New quote</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <CreateForm items={items} setItems={setItems} totals={totals} vat={vat} onDone={() => { setOpen(false); setItems([{ kind: 'fee', description: 'Broker professional fee', amount: '' }]); load(); }} />
      </DialogContent></Dialog>

      <div className="grid gap-2">
        {quotes.map(q => (
          <Card key={q.id}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{q.number}</span>
                  <Badge variant="outline" className="text-[10px]">{q.type}</Badge>
                  <Badge className={`${STATUS_TONE[q.status]} border-0 text-[10px]`}>{q.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {q.client ? `${q.client.name} · ` : ''}{q.shipment ? `${q.shipment.reference} · ` : ''}
                  fees {fmtTTD(q.feesTotal)} + disb {fmtTTD(q.disbursementsTotal)} + VAT {fmtTTD(q.vatTotal)}
                  {q.dueDate ? ` · due ${fmtDate(q.dueDate)}` : q.validUntil ? ` · valid ${fmtDate(q.validUntil)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-extrabold text-lg tabular-nums">{fmtTTD(q.total)}</span>
                {q.status === 'draft' && <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" onClick={() => setStatus(q.id, 'sent')}><Send className="h-3.5 w-3.5 mr-1" /> Send</Button>}
                {q.status === 'sent' && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus(q.id, 'paid')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark paid</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {quotes.length === 0 && (
          <Card><CardContent className="text-center py-14 text-muted-foreground">
            <ReceiptText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            No quotes yet. Create the first one — the client approves it from their portal.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function CreateForm({ items, setItems, totals, vat, onDone }: {
  items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  totals: { fees: number; disb: number }; vat: number; onDone: () => void;
}) {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [form, setForm] = useState({ clientId: '', shipmentId: '', type: 'quote', validUntil: '', dueDate: '', notes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ clients: ClientLite[] }>('/api/clients').then(d => setClients(d.clients)).catch(() => null);
    api<{ shipments: ShipmentLite[] }>('/api/shipments').then(d => setShipments(d.shipments)).catch(() => null);
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) => setItems(list => list.map((x, j) => j === i ? { ...x, ...patch } : x));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          items: items.filter(i => i.description && Number(i.amount) > 0).map(i => ({ kind: i.kind, description: i.description, amount: Number(i.amount) })),
        }),
      });
      toast({ title: 'Draft created', description: 'Send it when ready.' });
      onDone();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>New quote / invoice</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Type</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="quote">Quote (cotización)</option><option value="invoice">Invoice (factura)</option>
          </select></div>
        <div className="space-y-1.5"><Label>Client</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.clientId} onChange={e => set('clientId', e.target.value)}>
            <option value="">— choose —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      </div>
      <div className="space-y-1.5"><Label>Shipment (optional)</Label>
        <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.shipmentId} onChange={e => set('shipmentId', e.target.value)}>
          <option value="">— none —</option>
          {shipments.map(s => <option key={s.id} value={s.id}>{s.reference}</option>)}
        </select></div>

      <div className="space-y-2">
        <Label>Items</Label>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm w-32" value={it.kind} onChange={e => setItem(i, { kind: e.target.value as Item['kind'] })}>
              <option value="fee">Fee (VAT)</option><option value="disbursement">Disbursement</option>
            </select>
            <Input className="flex-1" placeholder="Description" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
            <Input className="w-28" type="number" placeholder="0.00" value={it.amount} onChange={e => setItem(i, { amount: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" onClick={() => setItems(l => l.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems(l => [...l, { kind: 'disbursement', description: '', amount: '' }])}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Fees subtotal</span><span className="tabular-nums">{fmtTTD(totals.fees)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Disbursements (no VAT)</span><span className="tabular-nums">{fmtTTD(totals.disb)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">VAT 12.5% (fees only)</span><span className="tabular-nums">{fmtTTD(vat)}</span></div>
        <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span className="tabular-nums">{fmtTTD(totals.fees + totals.disb + vat)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Valid until</Label><Input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Clearance + delivery Chaguanas" /></div>

      <DialogFooter><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
        {busy && <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}Create draft
      </Button></DialogFooter>
    </form>
  );
}
