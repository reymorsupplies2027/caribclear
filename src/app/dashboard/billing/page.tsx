'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtUSD, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, Globe2, ReceiptText, Wallet, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SubData {
  plan: string;
  priceUsd: number;
  limits: { users: number; activeShipments: number; vaultGb: number; regions: string[] | string };
  subscriptionEndsAt: string | null;
  isActive: boolean;
  invoices: Array<{ id: string; amount: number; currency: string; status: string; period: string | null; dueDate: string }>;
  payments: Array<{ id: string; plan: string; provider: string; amountUsd: number; status: string; createdAt: string }>;
  regions: {
    covered: Array<{ code: string; country: string; calibration: string }>;
    rateSets: Array<{ code: string; country: string; currency: string }>;
  };
  paymentRails: { wipay: boolean; paypal: boolean; manual: boolean };
}

const PLANS_FOR_SALE = [
  { id: 'pro', label: 'Pro', priceUsd: 149, note: 'Trinidad & Tobago desk' },
  { id: 'regional', label: 'Regional', priceUsd: 449, note: 'All 13 ASYCUDA administrations' },
  { id: 'enterprise', label: 'Enterprise', priceUsd: 1500, note: 'Calibration packs, SLA, ERP' },
];

export default function BillingPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SubData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<SubData>('/api/billing/subscription').then(setData).catch(() => null);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function checkout(plan: string, provider: 'wipay' | 'paypal' | 'manual') {
    setBusy(plan + provider);
    try {
      const res = await api<{ paymentRequestId: string; redirectUrl?: string; manual?: boolean; message?: string }>(
        '/api/billing/checkout',
        { method: 'POST', body: JSON.stringify({ plan, provider }) },
      );
      if (res.redirectUrl) {
        toast({ title: 'Redirecting to secure checkout…', description: provider === 'wipay' ? 'WiPay' : 'PayPal' });
        window.location.href = res.redirectUrl;
        return;
      }
      toast({ title: 'Manual payment flow', description: res.message || 'Bank transfer instructions recorded — the platform admin will activate your plan after the transfer clears.', duration: 9000 });
    } catch (err) {
      toast({ title: 'Checkout failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
    } finally { setBusy(null); }
  }

  if (!data) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }

  const regionsAll = Array.isArray(data.limits.regions) && data.limits.regions[0] === 'ALL';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Billing &amp; rental</h1>
        <p className="text-muted-foreground text-sm">Your CaribClear subscription: plan, coverage and payment history. Flat monthly rental in USD.</p>
      </div>

      {/* CURRENT PLAN */}
      <Card>
        <CardHeader><CardTitle className="flex items-center justify-between">
          <span>Current plan: {data.plan.toUpperCase()}</span>
          <Badge variant={data.isActive ? 'default' : 'destructive'}>{data.isActive ? 'active' : 'inactive'}</Badge>
        </CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-3xl font-extrabold">{fmtUSD(data.priceUsd)}<span className="text-sm text-muted-foreground font-normal">/month</span></p>
            {data.subscriptionEndsAt && <p className="text-sm text-muted-foreground mt-1">Renews / ends: {fmtDate(data.subscriptionEndsAt)}</p>}
          </div>
          <div className="text-sm space-y-1">
            <p className="font-medium flex items-center gap-2"><Globe2 className="h-4 w-4" /> Regional coverage</p>
            <p className="text-muted-foreground">{regionsAll ? `All 13 administrations — rate sets live for ${data.regions.rateSets.length + 1} countries` : 'Trinidad & Tobago — upgrade to Regional to calculate and e-file for JM/BB/GY/LC/VC/GD/AG'}</p>
          </div>
          <div className="text-sm space-y-1">
            <p className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment rails</p>
            <p className="text-muted-foreground">
              WiPay: {data.paymentRails.wipay ? 'live' : 'pending credentials'} · PayPal: {data.paymentRails.paypal ? 'live' : 'pending credentials'} · Bank transfer: always available
            </p>
          </div>
        </CardContent>
      </Card>

      {/* REGIONAL RATE SETS (what regional unlocks) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Regional landed-cost rate sets (live today)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge>TT — Trinidad &amp; Tobago (full engine: vehicles incl.)</Badge>
            {data.regions.rateSets.map((r) => (
              <Badge key={r.code} variant="outline">{r.code} — {r.country} · {r.currency}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Vehicle regimes outside T&amp;T are refused by the engine (national excise schemes not calibrated) — request a calibration pack from the platform team.</p>
        </CardContent>
      </Card>

      {/* CHANGE PLAN */}
      <Card>
        <CardHeader><CardTitle className="text-base">Change plan</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {PLANS_FOR_SALE.map((p) => (
            <div key={p.id} className={`rounded-lg border p-4 ${data.plan === p.id ? 'border-primary' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.label}</h3>
                {data.plan === p.id && <Badge>current</Badge>}
              </div>
              <p className="text-2xl font-bold mt-1">{fmtUSD(p.priceUsd)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
              <p className="text-sm text-muted-foreground mt-1">{p.note}</p>
              {data.plan === p.id ? (
                <Button className="w-full mt-3" variant="outline" disabled>Active</Button>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => checkout(p.id, 'wipay')}>WiPay</Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => checkout(p.id, 'paypal')}>PayPal</Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => checkout(p.id, 'manual')}>Transfer</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* INVOICES + PAYMENTS */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Rental invoices</CardTitle></CardHeader>
          <CardContent>
            {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices issued yet.</p>}
            <div className="space-y-2">
              {data.invoices.slice(0, 8).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <span>{inv.period || fmtDate(inv.dueDate)}</span>
                  <span className="font-medium">{inv.currency} {inv.amount.toFixed(2)}</span>
                  <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'overdue' ? 'destructive' : 'outline'}>{inv.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Payment attempts</CardTitle></CardHeader>
          <CardContent>
            {data.payments.length === 0 && <p className="text-sm text-muted-foreground">No checkout attempts yet.</p>}
            <div className="space-y-2">
              {data.payments.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <span className="flex items-center gap-1.5">
                    {p.status === 'paid' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                    {p.plan} · {p.provider}
                  </span>
                  <span className="font-medium">{fmtUSD(p.amountUsd)}</span>
                  <Badge variant={p.status === 'paid' ? 'default' : 'outline'}>{p.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
