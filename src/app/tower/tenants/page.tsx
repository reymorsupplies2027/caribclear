'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, fmtUSD, fmtDate } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Plus, Search, CircleDot } from 'lucide-react';

interface TenantRow {
  id: string; name: string; slug: string; plan: string; priceUsd: number | null;
  region: string; city: string | null; contactEmail: string | null;
  isActive: boolean; createdAt: string;
  users: number; activeUsers: number; shipments: number; activeShipments: number;
  documents: number; storageBytes: number;
  invoicesPaid: number; invoicesPending: number; invoicesOverdue: number;
  lastPayment: string | null; activityDays: number; activityState: 'green' | 'amber' | 'red';
}

const REGIONS = ['Trinidad', 'Tobago', 'Jamaica', 'Barbados', 'Guyana', 'CARICOM'];
const ACTIVITY_META = {
  green: { label: 'Active ≤2d', cls: 'text-emerald-600' },
  amber: { label: 'Idle ≤7d', cls: 'text-amber-600' },
  red: { label: 'Idle >7d', cls: 'text-rose-600' },
} as const;

export default function TowerTenantsPage() {
  const sp = useSearchParams();
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState(sp.get('region') || 'all');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (region !== 'all') params.set('region', region);
      if (plan !== 'all') params.set('plan', plan);
      if (status !== 'all') params.set('status', status);
      if (q) params.set('q', q);
      const data = await api<{ tenants: TenantRow[] }>(`/api/tower/tenants?${params.toString()}`);
      setRows(data.tenants); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load tenants.'); }
  }, [region, plan, status, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2"><Building2 className="h-5 w-5 text-violet-600" />Tenant book</h1>
          <p className="text-sm text-muted-foreground">Every apartment in the building — who moved in, what they pay, how they live.</p>
        </div>
        <Link href="/tower/tenants/new">
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white"><Plus className="h-4 w-4 mr-1" /> Add tenant</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / city…" className="pl-8" aria-label="Search tenants" />
        </div>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger aria-label="Filter by region"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger aria-label="Filter by plan"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="free">Free</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <Card><CardContent className="p-6 text-center text-sm text-rose-600">{error}</CardContent></Card>}

      {!rows && !error && <p className="text-sm text-muted-foreground animate-pulse">Loading tenant book…</p>}

      {rows && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{rows.length} tenant(s)</p>
          {rows.map(t => (
            <Link key={t.id} href={`/tower/tenants/${t.id}`} className="block group">
              <Card className="group-hover:border-violet-500/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
                    {/* Identity */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold truncate">{t.name}</span>
                        <Badge className={t.plan === 'pro' ? 'bg-amber-500 text-slate-900 border-0' : ''}>{t.plan}</Badge>
                        {!t.isActive && <Badge variant="destructive">suspended</Badge>}
                        {t.invoicesOverdue > 0 && <Badge variant="outline" className="border-rose-400 text-rose-600">{t.invoicesOverdue} overdue</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        📍 {t.city || '—'}, {t.region} · moved in {fmtDate(t.createdAt)} · /{t.slug}
                      </p>
                    </div>
                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-2 lg:gap-4 text-center shrink-0">
                      <div>
                        <p className="text-sm font-bold">{t.users}</p>
                        <p className="text-[10px] text-muted-foreground">users</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.activeShipments}<span className="text-muted-foreground">/{t.shipments}</span></p>
                        <p className="text-[10px] text-muted-foreground">shipments</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.invoicesPaid}</p>
                        <p className="text-[10px] text-muted-foreground">invoices paid</p>
                      </div>
                      <div>
                        <p className={`text-sm font-bold flex items-center justify-center gap-1 ${ACTIVITY_META[t.activityState].cls}`}>
                          <CircleDot className="h-3 w-3" />{t.activityDays}d
                        </p>
                        <p className="text-[10px] text-muted-foreground">activity</p>
                      </div>
                    </div>
                    {/* Money */}
                    <div className="text-right shrink-0 lg:w-28">
                      <p className="text-sm font-bold text-emerald-600">{t.plan === 'pro' ? fmtUSD(t.priceUsd ?? 149) + '/mo' : 'Free'}</p>
                      <p className="text-[10px] text-muted-foreground">last payment {t.lastPayment ? fmtDate(t.lastPayment) : '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {rows.length === 0 && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              No tenants match those filters. <Link href="/tower/tenants/new" className="text-violet-600 underline">Onboard the first one</Link>.
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
