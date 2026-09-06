'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtDate, fmtUSD, SHIPMENT_STATUS_META } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe2, Ship, FileText, ReceiptText, CheckCircle2, Clock, LogOut } from 'lucide-react';
import { SHIPMENT_STATUSES } from '@/lib/engine/seed-data';
import { toast } from '@/hooks/use-toast';
import { enqueueOp, isOfflineFailure } from '@/lib/offline/outbox';
import { vibrate } from '@/lib/sounds';

interface PortalData {
  client: { name: string; company: string | null };
  shipments: { id: string; reference: string; status: string; mode: string; goodsDescription: string; eta: string | null; fobUsd: number; freightUsd: number; insuranceUsd: number; containers: { id: string }[] }[];
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
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" /> Exit</Button>
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
              const idx = SHIPMENT_STATUSES.findIndex(x => x.key === s.status);
              return (
                <Card key={s.id}>
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
                    <div className="mt-3 flex items-center gap-1">
                      {SHIPMENT_STATUSES.map((st, i) => (
                        <div key={st.key} className="flex-1 h-1.5 rounded-full" style={{ background: i <= idx ? '#0d9488' : 'rgba(148,163,184,0.3)' }} title={st.label} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{s.containers.length} container(s) · declared value {fmtUSD(s.fobUsd + s.freightUsd + s.insuranceUsd)}</p>
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
