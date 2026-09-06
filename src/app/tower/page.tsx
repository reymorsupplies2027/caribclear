'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtUSD, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2, Users, DollarSign, AlertTriangle, Ship, ShieldCheck,
  RefreshCw, ArrowRight, MapPin, FileClock, Lock, Sparkles,
} from 'lucide-react';

interface Overview {
  kpis: {
    tenants: number; activeTenants: number; suspendedTenants: number; users: number;
    proCount: number; freeCount: number; conversion: number;
    mrrUsd: number; collectedThisMonthUsd: number; overdueCount: number; overdueUsd: number;
    shipmentsInNetwork: number; containersAtRisk: number; exposureTtd: number;
    docsExpiring30: number; auditEntries24h: number; lockedAccounts: number; chainBroken: number;
  };
  byRegion: Record<string, { total: number; active: number; pro: number; mrr: number }>;
  chainChecks: { name: string; ok: boolean; checked: number }[];
  platformChain: { ok: boolean; checked: number };
  leads: { total: number; latest: { id: string; name: string; company: string | null; email: string; region: string | null; exposureTtd: number | null; createdAt: string }[] };
}

export default function TowerOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await api<Overview>('/api/tower/overview')); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-600" />{error}
      </CardContent></Card>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground animate-pulse">Loading the dark room…</p>;
  const k = data.kpis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Building overview</h1>
          <p className="text-sm text-muted-foreground">The private control room — every tenant, every region, one glance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Revenue belt */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">MRR (occupied)</span>
              <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-2xl font-extrabold mt-1">{fmtUSD(k.mrrUsd)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{k.proCount} Pro · {k.freeCount} Free · {k.conversion}% conversion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Collected this month</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1">{fmtUSD(k.collectedThisMonthUsd)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Platform subscriptions (USD)</p>
          </CardContent>
        </Card>
        <Card className={k.overdueCount > 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Overdue invoices</span>
              <AlertTriangle className={`h-4 w-4 ${k.overdueCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
            </div>
            <p className="text-2xl font-extrabold mt-1">{fmtUSD(k.overdueUsd)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{k.overdueCount} invoice(s) past due</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Occupancy</span>
              <Building2 className="h-4 w-4 text-teal-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1">{k.activeTenants}<span className="text-base text-muted-foreground">/{k.tenants}</span></p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{k.suspendedTenants} suspended · {k.users} users</p>
          </CardContent>
        </Card>
      </div>

      {/* Network load + integrity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Network load — cargo across ALL apartments</CardTitle></CardHeader>
          <CardContent className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <Ship className="h-4 w-4 text-teal-600 mb-1.5" />
              <p className="text-xl font-bold">{k.shipmentsInNetwork}</p>
              <p className="text-[11px] text-muted-foreground">shipments in motion</p>
            </div>
            <div className={`rounded-lg border p-3 ${k.containersAtRisk > 0 ? 'border-rose-500/40 bg-rose-500/5' : ''}`}>
              <AlertTriangle className={`h-4 w-4 mb-1.5 ${k.containersAtRisk > 0 ? 'text-rose-600' : 'text-muted-foreground'}`} />
              <p className="text-xl font-bold">{k.containersAtRisk}</p>
              <p className="text-[11px] text-muted-foreground">containers at demurrage risk</p>
            </div>
            <div className="rounded-lg border p-3">
              <DollarSign className="h-4 w-4 text-amber-600 mb-1.5" />
              <p className="text-xl font-bold">{fmtTTD(k.exposureTtd)}</p>
              <p className="text-[11px] text-muted-foreground">network exposure TTD</p>
            </div>
            <div className="rounded-lg border p-3">
              <FileClock className="h-4 w-4 text-sky-600 mb-1.5" />
              <p className="text-xl font-bold">{k.docsExpiring30}</p>
              <p className="text-[11px] text-muted-foreground">documents expiring ≤30d</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className={`h-4 w-4 ${k.chainBroken === 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
              Chain integrity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {k.chainBroken === 0 ? (
              <Badge className="bg-emerald-600 text-white border-0">ALL CHAINS VERIFIED</Badge>
            ) : (
              <Badge variant="destructive">{k.chainBroken} chain(s) BROKEN</Badge>
            )}
            <p className="text-xs text-muted-foreground">Platform: {data.platformChain.checked} entries · {data.platformChain.ok ? 'hash-verified' : 'BROKEN'}</p>
            <ul className="text-xs space-y-1">
              {data.chainChecks.map(c => (
                <li key={c.name} className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className={c.ok ? 'text-emerald-600' : 'text-rose-600 font-semibold'}>{c.ok ? '✓' : '✗'} {c.checked}</span>
                </li>
              ))}
            </ul>
            {k.lockedAccounts > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1"><Lock className="h-3 w-3" />{k.lockedAccounts} locked account(s) now</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Occupancy by region */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-600" />Occupancy by region</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {Object.entries(data.byRegion).map(([region, r]) => (
              <Link key={region} href={`/tower/tenants?region=${encodeURIComponent(region)}`}
                className="rounded-lg border p-3 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors">
                <p className="font-bold text-sm">{region}</p>
                <p className="text-2xl font-extrabold mt-0.5">{r.total}</p>
                <p className="text-[11px] text-muted-foreground">{r.active} active · {r.pro} Pro</p>
                {r.mrr > 0 && <p className="text-[11px] font-semibold text-emerald-600 mt-1">{fmtUSD(r.mrr)} MRR</p>}
              </Link>
            ))}
            {Object.keys(data.byRegion).length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">No tenants yet — onboard the first from Tenants → Add tenant.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sales leads (from the public sales portal) */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600" />Sales pipeline — portal leads
            <Badge variant="outline" className="ml-auto">{data.leads.total} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.leads.latest.map(l => (
            <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-lg border bg-background p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{l.name}{l.company ? <span className="text-muted-foreground font-normal"> · {l.company}</span> : null}</p>
                <p className="text-[11px] text-muted-foreground">{l.email}{l.region ? ` · ${l.region}` : ''} · {fmtDate(l.createdAt)}</p>
              </div>
              {l.exposureTtd !== null && l.exposureTtd > 0 && (
                <span className="text-xs font-bold text-rose-600 shrink-0">their pain: {fmtTTD(l.exposureTtd)}</span>
              )}
            </div>
          ))}
          {data.leads.latest.length === 0 && <p className="text-sm text-muted-foreground">No leads yet — they arrive from the sales portal calculator.</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/tower/tenants"><Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">Open tenant book <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
        <Link href="/tower/invoices"><Button size="sm" variant="outline">Billing book</Button></Link>
        <Link href="/tower/rates"><Button size="sm" variant="outline">Rate command</Button></Link>
      </div>
      <p className="text-[11px] text-muted-foreground">Audit entries last 24h: {k.auditEntries24h} · Generated {fmtDate(new Date())}</p>
    </div>
  );
}
