'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Globe2, Building2, Users, Ship, ShieldCheck, LogOut, CreditCard } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface AdminData {
  stats: { tenantCount: number; userCount: number; shipmentCount: number; auditCount: number };
  tenants: { id: string; name: string; slug: string; plan: string; isActive: boolean; createdAt: string; users: number; shipments: number; activeShipments: number; lastInvoice: { amount: number; status: string } | null }[];
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<AdminData>('/api/admin')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Super admin access required.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(tenantId: string, body: Record<string, unknown>) {
    try {
      await api('/api/admin', { method: 'PATCH', body: JSON.stringify({ tenantId, ...body }) });
      toast({ title: 'Tenant updated' });
      load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="max-w-md text-center"><CardContent className="p-8">
          <ShieldCheck className="h-10 w-10 mx-auto text-rose-600 mb-3" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={logout}>Back to sign in</Button>
        </CardContent></Card>
      </div>
    );
  }
  if (!data) return <p className="p-6 text-muted-foreground">Loading platform console…</p>;

  return (
    <div className="min-h-screen">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-slate-900 grid place-items-center"><Globe2 className="h-4 w-4 text-white" /></div>
            <span className="font-bold text-sm">CaribClear · Platform Console</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" /> Exit</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Building2, label: 'Tenants', value: data.stats.tenantCount },
            { icon: Users, label: 'Users', value: data.stats.userCount },
            { icon: Ship, label: 'Shipments', value: data.stats.shipmentCount },
            { icon: ShieldCheck, label: 'Audit entries', value: data.stats.auditCount },
          ].map(x => (
            <Card key={x.label}><CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{x.label}</span>
                <x.icon className="h-5 w-5 text-teal-600" />
              </div>
              <p className="text-3xl font-extrabold mt-1">{x.value}</p>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">Tenants — plans & lifecycle</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.tenants.map(t => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{t.name}</span>
                    <Badge className={t.plan === 'pro' ? 'bg-amber-500 text-slate-900 border-0' : ''}>{t.plan}</Badge>
                    {!t.isActive && <Badge variant="destructive">suspended</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    /{t.slug} · {t.users} user(s) · {t.activeShipments} active / {t.shipments} total · since {fmtDate(t.createdAt)}
                    {t.lastInvoice ? ` · last invoice US$${t.lastInvoice.amount} (${t.lastInvoice.status})` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {t.plan === 'free'
                    ? <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" onClick={() => patch(t.id, { plan: 'pro' })}><CreditCard className="h-3.5 w-3.5 mr-1" /> Set Pro</Button>
                    : <Button size="sm" variant="outline" onClick={() => patch(t.id, { plan: 'free' })}>Set Free</Button>}
                  {t.isActive
                    ? <Button size="sm" variant="destructive" onClick={() => patch(t.id, { isActive: false })}>Suspend</Button>
                    : <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => patch(t.id, { isActive: true })}>Reactivate</Button>}
                </div>
              </div>
            ))}
            {data.tenants.length === 0 && <p className="text-sm text-muted-foreground">No tenants yet — register the first broker from the landing page.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Operations notes</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1.5">
            <p>• Plan changes flip feature flags instantly — no data migration, no downtime.</p>
            <p>• Suspension blocks sign-in at the app layer; data remains intact for reactivation.</p>
            <p>• The audit trail is hash-chained per tenant; platform admins never edit case data.</p>
            <p>• Cron (pg_cron in Supabase): retention purge + SLA escalation daily at 09:00/09:30.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
