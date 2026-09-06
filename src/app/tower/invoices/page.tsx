'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtUSD, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Wand2, MapPin } from 'lucide-react';

interface Invoice {
  id: string; amount: number; currency: string; status: string; period: string | null;
  dueDate: string; paidAt: string | null; effectiveStatus: string;
  tenant: { id: string; name: string; region: string; city: string | null; plan: string };
}

const CLS: Record<string, string> = {
  paid: 'bg-emerald-600 text-white border-0',
  pending: 'bg-amber-500 text-slate-900 border-0',
  overdue: 'bg-rose-600 text-white border-0',
};

export default function TowerInvoicesPage() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [totals, setTotals] = useState<{ collected: number; pending: number; overdue: number } | null>(null);
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<{ invoices: Invoice[]; totals: { collected: number; pending: number; overdue: number } }>(
        `/api/tower/invoices${status !== 'all' ? `?status=${status}` : ''}`,
      );
      setInvoices(data.invoices); setTotals(data.totals); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load billing.'); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const res = await api<{ createdCount: number; period: string }>('/api/tower/invoices', { method: 'POST' });
      toast({ title: `Period ${res.period}`, description: `${res.createdCount} invoice(s) generated for active Pro tenants.` });
      await load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  }

  async function mark(inv: Invoice, s: string) {
    try {
      await api(`/api/tower/invoices/${inv.id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) });
      await load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2"><Receipt className="h-5 w-5 text-violet-600" />Billing book</h1>
          <p className="text-sm text-muted-foreground">Who pays what, and when. The rent roll of the building.</p>
        </div>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={generate} disabled={busy}>
          <Wand2 className="h-4 w-4 mr-1" />{busy ? 'Generating…' : 'Generate this month'}
        </Button>
      </div>

      {error && <Card><CardContent className="p-6 text-center text-sm text-rose-600">{error}</CardContent></Card>}

      {totals && (
        <div className="grid gap-3 grid-cols-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-xl font-extrabold text-emerald-600">{fmtUSD(totals.collected)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-extrabold text-amber-600">{fmtUSD(totals.pending)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-xl font-extrabold text-rose-600">{fmtUSD(totals.overdue)}</p>
          </CardContent></Card>
        </div>
      )}

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>

      {!invoices && !error && <p className="text-sm text-muted-foreground animate-pulse">Loading rent roll…</p>}
      {invoices && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{invoices.length} invoice(s)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/tower/tenants/${inv.tenant.id}`} className="font-semibold hover:text-violet-600 hover:underline">{inv.tenant.name}</Link>
                    <Badge className={CLS[inv.effectiveStatus] ?? ''}>{inv.effectiveStatus}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <MapPin className="inline h-3 w-3" /> {inv.tenant.city || '—'}, {inv.tenant.region} · {inv.period ?? 'one-off'} · due {fmtDate(inv.dueDate)}{inv.paidAt ? ` · paid ${fmtDate(inv.paidAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold">{fmtUSD(inv.amount)}</span>
                  {inv.effectiveStatus !== 'paid'
                    ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mark(inv, 'paid')}>Mark paid</Button>
                    : <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => mark(inv, 'pending')}>Undo</Button>}
                </div>
              </div>
            ))}
            {invoices.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No invoices. Generate the month above.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
