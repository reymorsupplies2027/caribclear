'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtDate, SHIPMENT_STATUS_META } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Ship, FolderLock, AlertTriangle, DollarSign, Plus, ArrowRight, CircleCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Shipment {
  id: string; reference: string; status: string; goodsDescription: string;
  mode: string; eta: string | null; demurrageStartDate: string | null;
  demurrageFreeDays: number; demurragePerDayTtd: number; clientId: string | null;
  client?: { name: string } | null;
}
interface Doc { id: string; title: string; expiryDate: string | null }
interface Me { user: { role: string }; tenant: { plan: string; onboarding: string } | null }
interface Calc { id: string; name: string; totalTtd: number; createdAt: string }

const STATUS_ORDER = ['order_placed', 'sailed', 'in_transit', 'arrived', 'unloaded', 'in_customs', 'released'];

export default function DashboardPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ shipments: Shipment[] }>('/api/shipments').catch(() => ({ shipments: [] })),
      api<{ documents: Doc[] }>('/api/documents').catch(() => ({ documents: [] })),
      api<{ calcs: Calc[] }>('/api/costs').catch(() => ({ calcs: [] })),
      api<Me>('/api/auth/me').catch(() => null),
    ]).then(([s, d, c, m]) => { setShipments(s.shipments); setDocs(d.documents); setCalcs(c.calcs); setMe(m); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  }

  const active = shipments.filter(s => s.status !== 'released');
  const inCustoms = shipments.filter(s => s.status === 'in_customs');
  const released = shipments.filter(s => s.status === 'released');

  // Demurrage risk: within 3 days of free days ending (or already penalized)
  const demurrageRisk = active.filter(s => {
    if (!s.demurrageStartDate) return false;
    const freeEnd = new Date(s.demurrageStartDate).getTime() + s.demurrageFreeDays * 86400000;
    return freeEnd - Date.now() <= 3 * 86400000;
  });
  const docsExpiring = docs.filter(d => d.expiryDate && new Date(d.expiryDate).getTime() - Date.now() < 30 * 86400000);
  const monthlyCostTtd = calcs.reduce((sum, c) => sum + (c.totalTtd || 0), 0);

  const chartData = STATUS_ORDER.map(st => ({
    name: SHIPMENT_STATUS_META[st].label,
    count: shipments.filter(s => s.status === st).length,
    fill: st === 'released' ? '#059669' : st === 'in_customs' ? '#e11d48' : '#0d9488',
  }));

  let checklist: Array<{ id: string; label: string; done: boolean }> = [];
  try { checklist = me?.tenant ? JSON.parse(me.tenant.onboarding) : []; } catch { /* */ }
  const doneCount = checklist.filter(x => x.done).length;

  const alerts = [
    ...demurrageRisk.map(s => ({ id: `d-${s.id}`, sev: 'critical', text: `${s.reference}: demurrage free days running out — penalties TT$${s.demurragePerDayTtd}/day start soon.` })),
    ...docsExpiring.map(d => ({ id: `x-${d.id}`, sev: 'warning', text: `Document "${d.title}" expires ${fmtDate(d.expiryDate)} — renew now.` })),
    ...inCustoms.map(s => ({ id: `c-${s.id}`, sev: 'warning', text: `${s.reference} is in customs — follow up with the declaration.` })),
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Ship} tone="teal" label="Shipments in motion" value={String(active.length)} hint={`${released.length} released lifetime`} href="/dashboard/shipments" />
        <KpiCard icon={AlertTriangle} tone="rose" label="Needs attention" value={String(alerts.length)} hint={`${inCustoms.length} in customs · ${demurrageRisk.length} demurrage risk`} href="/dashboard/shipments" />
        <KpiCard icon={FolderLock} tone="amber" label="Vault documents" value={String(docs.length)} hint={`${docsExpiring.length} expiring in 30 days`} href="/dashboard/documents" />
        <KpiCard icon={DollarSign} tone="emerald" label="Landed costs (30 calcs)" value={fmtTTD(monthlyCostTtd)} hint="Sum of latest calculations" href="/dashboard/calculator" />
      </div>

      {/* Alerts + checklist */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Alert center</CardTitle></CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CircleCheck className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                Nothing urgent — every shipment is on track.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {alerts.slice(0, 6).map(a => (
                  <li key={a.id} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${a.sev === 'critical' ? 'bg-rose-600' : 'bg-amber-500'}`} />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Setup checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={checklist.length ? (doneCount / checklist.length) * 100 : 0} className="h-2 mb-4" />
            <ul className="space-y-2.5 text-sm">
              {checklist.map(item => (
                <li key={item.id} className="flex items-center gap-2">
                  <CircleCheck className={`h-4 w-4 shrink-0 ${item.done ? 'text-emerald-500' : 'text-muted-foreground/30'}`} />
                  <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.label}</span>
                </li>
              ))}
              {checklist.length === 0 && <li className="text-muted-foreground">Checklist will appear after registration.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Chart + recent shipments */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-lg">Pipeline by state</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-28} textAnchor="end" height={58} stroke="currentColor" opacity={0.5} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                <Tooltip cursor={{ fill: 'rgba(13,148,136,0.08)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Latest shipments</CardTitle>
            <Link href="/dashboard/shipments"><Button size="sm" variant="ghost" className="gap-1">View all <ArrowRight className="h-4 w-4" /></Button></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {shipments.slice(0, 5).map(s => {
              const meta = SHIPMENT_STATUS_META[s.status];
              return (
                <Link key={s.id} href={`/dashboard/shipments/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">{s.reference}
                      <Badge variant="secondary" className="text-[10px] shrink-0">{s.mode === 'air' ? 'AIR' : 'SEA'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{s.goodsDescription}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`${meta.color} text-white border-0 text-[10px]`}>{meta.label}</Badge>
                    <div className="text-[11px] text-muted-foreground mt-1">ETA {fmtDate(s.eta)}</div>
                  </div>
                </Link>
              );
            })}
            {shipments.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Ship className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="mb-3">No shipments yet. Your first one takes 60 seconds.</p>
                <Link href="/dashboard/shipments"><Button className="bg-teal-600 hover:bg-teal-700"><Plus className="h-4 w-4 mr-1" /> Create shipment</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, tone, label, value, hint, href }: {
  icon: React.ComponentType<{ className?: string }>; tone: 'teal' | 'rose' | 'amber' | 'emerald';
  label: string; value: string; hint: string; href: string;
}) {
  const tones = {
    teal: 'bg-teal-600/10 text-teal-600', rose: 'bg-rose-600/10 text-rose-600',
    amber: 'bg-amber-500/15 text-amber-600', emerald: 'bg-emerald-600/10 text-emerald-600',
  };
  return (
    <Link href={href}>
      <Card className="hover:border-teal-600/40 transition-colors h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className={`h-9 w-9 rounded-lg grid place-items-center ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
          </div>
          <div className="text-3xl font-extrabold mt-2 tracking-tight">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
