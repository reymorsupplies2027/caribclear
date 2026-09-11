'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ReceiptText, Plus, Trash2, Send, CheckCircle2, XCircle, Landmark } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * Quotes & invoices — multi-currency.
 * - Invoice currency: every line converts into it (server-side, with the
 *   tenant FX table; provenance lands in fxDetailJson).
 * - Lines can carry their own currency + an optional pinned rate.
 * - Invoices can attach PAID disbursements (real outlay rows) — the outlay is
 *   marked billed server-side.
 * - Status flow: draft → sent → (client approves in portal, or staff records
 *   a phone approval) → paid. rejected is terminal.
 */

interface Item { kind: 'fee' | 'disbursement'; description: string; amount: string; currency: string; fxRate: string }
interface Quote {
  id: string; number: string; type: string; status: string; feesTotal: number; disbursementsTotal: number;
  vatRate: number; vatTotal: number; total: number; currency: string; validUntil: string | null; dueDate: string | null;
  itemsJson: string; client?: { name: string } | null; shipment?: { reference: string } | null; createdAt: string;
}
interface ClientLite { id: string; name: string }
interface ShipmentLite { id: string; reference: string }
interface DisbLite { id: string; category: string; amount: number; currency: string; vendorRef: string | null; status: string; shipmentId: string | null }

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', sent: 'bg-amber-500 text-slate-900',
  approved: 'bg-teal-600 text-white', rejected: 'bg-rose-600 text-white', paid: 'bg-emerald-600 text-white',
};
const CCYS = ['TTD', 'USD', 'JMD', 'BBD', 'GYD', 'XCD'];
const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyItem = (): Item => ({ kind: 'fee', description: 'Broker professional fee', amount: '', currency: 'TTD', fxRate: '' });

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([emptyItem()]);

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

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quotes &amp; invoices</h1>
          <p className="text-sm text-muted-foreground">Fees + disbursements + VAT on fees — multi-currency, client approves in the portal. Outlays bill from Accounting.</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New quote / invoice</Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <CreateForm items={items} setItems={setItems} onDone={() => { setOpen(false); setItems([emptyItem()]); load(); }} />
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
                  <Badge variant="outline" className="text-[10px]">{q.currency}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {q.client ? `${q.client.name} · ` : ''}{q.shipment ? `${q.shipment.reference} · ` : ''}
                  fees {money(q.feesTotal, q.currency)} + disb {money(q.disbursementsTotal, q.currency)} + VAT {money(q.vatTotal, q.currency)}
                  {q.dueDate ? ` · due ${fmtDate(q.dueDate)}` : q.validUntil ? ` · valid ${fmtDate(q.validUntil)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-extrabold text-lg tabular-nums">{money(q.total, q.currency)}</span>
                {q.status === 'draft' && <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" onClick={() => setStatus(q.id, 'sent')}><Send className="h-3.5 w-3.5 mr-1" /> Send</Button>}
                {q.status === 'sent' && (
                  <>
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => setStatus(q.id, 'approved')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Record approval</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(q.id, 'rejected')}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </>
                )}
                {q.status === 'approved' && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus(q.id, 'paid')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark paid</Button>}
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

function CreateForm({ items, setItems, onDone }: {
  items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>>; onDone: () => void;
}) {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [disb, setDisb] = useState<DisbLite[]>([]);
  const [pickedDisb, setPickedDisb] = useState<string[]>([]);
  const [invoiceCcy, setInvoiceCcy] = useState('TTD');
  const [form, setForm] = useState({ clientId: '', shipmentId: '', type: 'quote', validUntil: '', dueDate: '', notes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ clients: ClientLite[] }>('/api/clients').then(d => setClients(d.clients)).catch(() => null);
    api<{ shipments: ShipmentLite[] }>('/api/shipments').then(d => setShipments(d.shipments)).catch(() => null);
    api<{ disbursements: DisbLite[] }>('/api/accounting/disbursements').then(d => setDisb(d.disbursements)).catch(() => null);
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) => setItems(list => list.map((x, j) => j === i ? { ...x, ...patch } : x));

  // Approximate preview: same-currency lines add up; other-currency lines use the pinned rate if given.
  const totals = items.reduce((acc, it) => {
    const amt = Number(it.amount) || 0;
    const rate = it.currency === invoiceCcy ? 1 : (Number(it.fxRate) || 0);
    const converted = amt * (rate || 0);
    if (it.kind === 'fee') acc.fees += converted; else acc.disb += converted;
    return acc;
  }, { fees: 0, disb: 0 });
  const vat = totals.fees * 0.125;
  const pickedRows = disb.filter(d => pickedDisb.includes(d.id));
  const pickedTotal = pickedRows.reduce((s, d) => s + (d.currency === invoiceCcy ? d.amount : 0), 0);
  const pickedForeign = pickedRows.filter(d => d.currency !== invoiceCcy);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ fxDetail: Array<{ provenance: string }>; unresolved: unknown[] }>('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          currency: invoiceCcy,
          items: items.filter(i => i.description && Number(i.amount) > 0).map(i => ({
            kind: i.kind, description: i.description, amount: Number(i.amount),
            currency: i.currency || invoiceCcy,
            fxRate: i.fxRate ? Number(i.fxRate) : undefined,
          })),
          disbursementIds: form.type === 'invoice' ? pickedDisb : [],
        }),
      });
      const converted = res.fxDetail?.filter(f => f.provenance !== 'identity').length || 0;
      toast({
        title: 'Draft created',
        description: converted ? `${converted} line(s) converted with FX provenance recorded.` : 'Send it when ready.',
      });
      onDone();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  const billable = disb.filter(d => d.status === 'paid' && d.shipmentId === form.shipmentId && !d.vendorRef?.startsWith('IN-'));

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>New quote / invoice</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Type</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="quote">Quote</option><option value="invoice">Invoice</option>
          </select></div>
        <div className="space-y-1.5"><Label>Invoice currency</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={invoiceCcy} onChange={e => setInvoiceCcy(e.target.value)}>
            {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Client</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.clientId} onChange={e => set('clientId', e.target.value)}>
            <option value="">— choose —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Shipment {form.type === 'invoice' && pickedDisb.length > 0 && <span className="text-rose-600">(required to bill outlays)</span>}</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.shipmentId} onChange={e => set('shipmentId', e.target.value)}>
            <option value="">— none —</option>
            {shipments.map(s => <option key={s.id} value={s.id}>{s.reference}</option>)}
          </select></div>
      </div>

      <div className="space-y-2">
        <Label>Items</Label>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm w-32" value={it.kind} onChange={e => setItem(i, { kind: e.target.value as Item['kind'] })}>
              <option value="fee">Fee (VAT)</option><option value="disbursement">Disbursement</option>
            </select>
            <Input className="flex-1 min-w-32" placeholder="Description" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
            <Input className="w-24" type="number" placeholder="0.00" value={it.amount} onChange={e => setItem(i, { amount: e.target.value })} />
            <select className="h-9 rounded-md border border-input bg-transparent px-1 text-sm w-20" value={it.currency} onChange={e => setItem(i, { currency: e.target.value })} aria-label="Line currency">
              {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {it.currency !== invoiceCcy && (
              <Input className="w-24" type="number" step="0.0001" placeholder="rate" value={it.fxRate} onChange={e => setItem(i, { fxRate: e.target.value })} aria-label="Pinned FX rate" />
            )}
            <Button type="button" variant="ghost" size="icon" onClick={() => setItems(l => l.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems(l => [...l, { kind: 'disbursement', description: '', amount: '', currency: invoiceCcy, fxRate: '' }])}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
        </Button>
        <p className="text-[11px] text-muted-foreground">Lines in another currency convert into {invoiceCcy} using the tenant FX table — pin a rate to override. Every conversion is recorded with its source.</p>
      </div>

      {form.type === 'invoice' && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="flex items-center gap-2"><Landmark className="h-4 w-4" /> Attach paid outlays (duty, wharfage…)</Label>
          {billable.length === 0 && <p className="text-xs text-muted-foreground">No paid outlays for this shipment. Record and mark them paid in Accounting → Outlays.</p>}
          {billable.map(d => (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" className="accent-teal-600" checked={pickedDisb.includes(d.id)}
                onChange={e => setPickedDisb(list => e.target.checked ? [...list, d.id] : list.filter(x => x !== d.id))}
              />
              <span className="capitalize">{d.category.replace('_', ' ')}</span>
              <span className="font-medium">{money(d.amount, d.currency)}</span>
              {d.vendorRef && <span className="text-muted-foreground">· {d.vendorRef}</span>}
            </label>
          ))}
          {pickedForeign.length > 0 && (
            <p className="text-xs text-amber-600">{pickedForeign.length} outlay(s) in a different currency — they convert through the FX table (add the rate in Accounting → FX rates if missing).</p>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Fees subtotal (VATed)</span><span className="tabular-nums">{money(totals.fees, invoiceCcy)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Disbursements (no VAT){pickedDisb.length ? ` + ${pickedDisb.length} outlay(s)` : ''}</span><span className="tabular-nums">{money(totals.disb + pickedTotal, invoiceCcy)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">VAT 12.5% (fees only)</span><span className="tabular-nums">{money(vat, invoiceCcy)}</span></div>
        <div className="flex justify-between font-bold border-t pt-1"><span>Total (approx. {invoiceCcy})</span><span className="tabular-nums">{money(totals.fees + totals.disb + vat + pickedTotal, invoiceCcy)}</span></div>
        <p className="text-[11px] text-muted-foreground">Final totals are computed server-side with the FX table and recorded with per-line provenance.</p>
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
