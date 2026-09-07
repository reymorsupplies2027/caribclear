'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtDate, fmtUSD, fmtDateTime, SHIPMENT_STATUS_META } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe2, Ship, FileText, ReceiptText, CheckCircle2, Clock, LogOut, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SHIPMENT_STATUSES } from '@/lib/engine/seed-data';
import { toast } from '@/hooks/use-toast';
import { enqueueOp, isOfflineFailure } from '@/lib/offline/outbox';
import { vibrate } from '@/lib/sounds';

interface PortalData {
  client: { name: string; company: string | null };
  shipments: { id: string; reference: string; status: string; mode: string; goodsDescription: string; eta: string | null; fobUsd: number; freightUsd: number; insuranceUsd: number; createdAt: string; updatedAt: string; containers: { id: string }[] }[];
  quotes: { id: string; number: string; type: string; status: string; total: number; feesTotal: number; disbursementsTotal: number; vatTotal: number; validUntil: string | null; itemsJson: string }[];
  documents: { id: string; title: string; type: string; createdAt: string; shipment?: { reference: string } | null }[];
}

export default function PortalPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<PortalData>('/api/portal')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Portal access requires an importer account.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function approve(quoteId: string, number: string) {
    try {
      await api('/api/portal', { method: 'POST', body: JSON.stringify({ quoteId }) });
      toast({ title: `Approved ${number}`, description: 'Your broker has been notified instantly.' });
      vibrate(60);
      load();
    } catch (err) {
      if (isOfflineFailure(err)) {
        // Offline-first: queue the approval, keep the UI consistent, sync on reconnect.
        await enqueueOp({ url: '/api/portal', method: 'POST', body: JSON.stringify({ quoteId }), label: `Approve ${number}` });
        toast({ title: `Approval saved on device`, description: `You are offline. ${number} will be sent to your broker automatically when the signal returns.` });
        load();
      } else {
        toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
      }
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }

  async function sendQueryDoc(payload: { shipmentId: string; title: string; type: string; file: File }) {
    const buf = await payload.file.arrayBuffer();
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await api('/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        shipmentId: payload.shipmentId, title: payload.title, type: payload.type,
        fileName: payload.file.name, mimeType: payload.file.type || null, dataBase64: btoa(bin),
      }),
    });
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="max-w-md text-center"><CardContent className="p-8">
          <Globe2 className="h-10 w-10 mx-auto text-teal-600 mb-3" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link href="/login"><Button className="bg-teal-600 hover:bg-teal-700">Back to sign in</Button></Link>
        </CardContent></Card>
      </div>
    );
  }
  if (!data) return <div className="p-8 space-y-3 max-w-5xl mx-auto">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  const pending = data.quotes.filter(q => q.status === 'sent');

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-600/5 to-transparent">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-teal-600 grid place-items-center shrink-0"><Globe2 className="h-4 w-4 text-white" /></div>
            <div className="min-w-0">
              <span className="font-bold text-sm">CaribClear · Client Portal</span>
              <span className="block text-[11px] text-muted-foreground truncate">{data.client.company ?? data.client.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" /> Exit</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {pending.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><ReceiptText className="h-5 w-5 text-amber-500" /> Awaiting your approval ({pending.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {pending.map(q => (
                <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-background p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{q.number} <span className="text-muted-foreground font-normal">({q.type})</span></p>
                    <p className="text-xs text-muted-foreground">
                      fees {fmtTTD(q.feesTotal)} + disbursements {fmtTTD(q.disbursementsTotal)} + VAT {fmtTTD(q.vatTotal)}
                      {q.validUntil ? ` · valid until ${fmtDate(q.validUntil)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-extrabold text-lg">{fmtTTD(q.total)}</span>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(q.id, q.number)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <section>
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Ship className="h-5 w-5 text-teal-600" /> Your shipments</h2>
          <div className="grid gap-3">
            {data.shipments.map(s => {
              const meta = SHIPMENT_STATUS_META[s.status] ?? SHIPMENT_STATUS_META.order_placed;
              return (
                <Card key={s.id} className={s.status === 'in_customs' ? 'border-rose-300 dark:border-rose-500/40' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold">{s.reference} <Badge variant="secondary" className="ml-1 text-[10px]">{s.mode === 'air' ? 'AIR' : 'SEA'}</Badge></p>
                        <p className="text-sm text-muted-foreground truncate">{s.goodsDescription}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={`${meta.color} text-white border-0`}>{meta.label}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">ETA {fmtDate(s.eta)}</p>
                      </div>
                    </div>
                    <ShipmentTimeline shipment={s} />
                    <p className="text-xs text-muted-foreground mt-2">{s.containers.length} container(s) · declared value {fmtUSD(s.fobUsd + s.freightUsd + s.insuranceUsd)}</p>
                    {s.status === 'in_customs' && <QueryActionCard shipment={s} onSend={sendQueryDoc} onDone={load} />}
                  </CardContent>
                </Card>
              );
            })}
            {data.shipments.length === 0 && <p className="text-sm text-muted-foreground">No shipments yet — your broker will add them here.</p>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ReceiptText className="h-4 w-4 text-teal-600" /> Quotes & invoices</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.quotes.map(q => (
                <div key={q.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <span>{q.number} <Badge variant="secondary" className="text-[10px] ml-1">{q.status}</Badge></span>
                  <span className="font-semibold tabular-nums">{fmtTTD(q.total)}</span>
                </div>
              ))}
              {data.quotes.length === 0 && <p className="text-muted-foreground">Nothing billed yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-teal-600" /> Documents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.documents.map(d => (
                <div key={d.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <span className="truncate">{d.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(d.createdAt)}</span>
                </div>
              ))}
              {data.documents.length === 0 && <p className="text-muted-foreground">No documents shared yet.</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

/* ── Cargo-train timeline: horizontal on desktop, detailed vertical on mobile ── */
function ShipmentTimeline({ shipment: s }: { shipment: PortalData['shipments'][number] }) {
  const idx = Math.max(SHIPMENT_STATUSES.findIndex(x => x.key === s.status), 0);
  const last = SHIPMENT_STATUSES.length - 1;
  const fillPct = (idx / last) * 100;

  return (
    <>
      {/* Desktop — locomotive-to-destination track */}
      <div className="mt-4 hidden md:block" aria-hidden="true">
        <div className="relative">
          <div className="absolute top-[7px] left-0 right-0 h-[3px] rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="absolute top-[7px] left-0 h-[3px] rounded-full bg-teal-600 transition-all duration-700" style={{ width: `${fillPct}%` }} />
          <div className="relative flex justify-between">
            {SHIPMENT_STATUSES.map((st, i) => {
              const done = i < idx;
              const current = i === idx;
              return (
                <div key={st.key} className="flex flex-col items-center gap-1.5" style={{ width: 1 / (last + 1) * 100 + '%' }}>
                  <span className="relative grid place-items-center">
                    {current && <span className="absolute h-4 w-4 rounded-full bg-teal-500 animate-ping opacity-40" />}
                    <span className={`h-4 w-4 rounded-full border-2 transition-colors ${
                      current ? 'bg-teal-600 border-teal-600 ring-2 ring-teal-600/30 ring-offset-1' :
                      done ? 'bg-teal-600 border-teal-600' : 'bg-background border-slate-300 dark:border-slate-600'}`} />
                  </span>
                  <span className={`text-[10px] leading-tight text-center ${current ? 'font-black text-teal-700 dark:text-teal-400' : done ? 'font-medium text-muted-foreground' : 'text-muted-foreground/60'}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile — vertical log with real timestamps */}
      <ol className="mt-4 md:hidden space-y-0">
        <li className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
          <Clock className="h-3.5 w-3.5" /> Ordered {fmtDateTime(s.createdAt)} · ETA {fmtDate(s.eta)}
        </li>
        {SHIPMENT_STATUSES.map((st, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <li key={st.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${current ? 'bg-teal-600 ring-2 ring-teal-600/30' : done ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'}`} />
                {i < last && <span className={`w-px flex-1 min-h-[14px] ${done ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
              </div>
              <div className="pb-2 min-w-0">
                <p className={`text-xs leading-tight ${current ? 'font-bold text-teal-700 dark:text-teal-400' : done ? 'font-medium' : 'text-muted-foreground/60'}`}>{st.label}</p>
                {current && <p className="text-[10px] text-muted-foreground">Current since {fmtDateTime(s.updatedAt)}</p>}
                {done && <p className="text-[10px] text-muted-foreground">✓ cleared this stage</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ── Query actionability: the client actively unblocks the cargo ── */
function QueryActionCard({ shipment, onSend, onDone }: {
  shipment: PortalData['shipments'][number];
  onSend: (p: { shipmentId: string; title: string; type: string; file: File }) => Promise<void>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('permit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Attach the document Customs requested.'); return; }
    setBusy(true); setError('');
    try {
      await onSend({ shipmentId: shipment.id, title: `Query response — ${shipment.reference}`, type: docType, file });
      setOpen(false); setFile(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-400">Held by Customs — query open</p>
          <p className="text-xs text-rose-600/80 dark:text-rose-400/80">Your broker needs a document from you to unblock this shipment. Responding now shortens clearance time.</p>
        </div>
      </div>
      <Button onClick={() => setOpen(true)}
        className="mt-2.5 w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold animate-pulse">
        <ShieldAlert className="h-4 w-4 mr-1.5" /> Respond to Customs Query
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" /> Respond to Customs Query — {shipment.reference}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Attach the missing permit or requested document. It goes straight into the shipment vault
              (encrypted) and your broker is notified instantly.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Document type</Label>
              <select id="q-type" className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="permit">Missing permit / licence</option>
                <option value="commercial_invoice">Corrected commercial invoice</option>
                <option value="packing_list">Packing list</option>
                <option value="other">Other requested document</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-file">File (≤10MB)</Label>
              <Input id="q-file" type="file" required onChange={e => setFile(e.target.files?.[0] ?? null)} className="file:mr-3 file:rounded-md file:border-0 file:bg-rose-600 file:text-white file:px-3 file:py-1 file:text-sm" />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}><XCircle className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700" disabled={busy}>
                {busy ? <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" /> : <Upload className="h-4 w-4 mr-1" />}
                Upload response
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
