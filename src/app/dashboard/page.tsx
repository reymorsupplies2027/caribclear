'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtTTD, fmtDate, SHIPMENT_STATUS_META } from '@/lib/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Ship, FolderLock, AlertTriangle, DollarSign, Plus, ArrowRight, CircleCheck, Timer, ListChecks, AlarmClock, Anchor, OctagonX, FileText, ClipboardCheck, FileClock, Banknote, Filter, ShieldAlert } from 'lucide-react';
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
interface DemurrageRow {
  shipmentId: string; reference: string; clientName: string | null; containers: string[];
  daysUsed: number; daysLeft: number; exposureTtd: number; perDayTtd: number;
  risk: 'green' | 'amber' | 'red'; status: string;
}
interface WorkTask { kind: string; priority: number; title: string; detail: string; href: string }
interface WorkQueue {
  demurrage: DemurrageRow[]; tasks: WorkTask[];
  summary: { redContainers: number; totalExposureTtd: number; taskCount: number };
}

const STATUS_ORDER = ['order_placed', 'sailed', 'in_transit', 'arrived', 'unloaded', 'in_customs', 'released'];

/* ── Global port-status filter: isolate critical operations in one second ── */
type PortFilter = 'all_active' | 'lodgement' | 'query' | 'released';
const PORT_FILTERS: Array<{ key: PortFilter; label: string; hint: string; alert?: boolean }> = [
  { key: 'all_active', label: 'All Active', hint: 'Every shipment not yet released' },
  { key: 'lodgement', label: 'In Lodgement', hint: 'Arrived / discharged / declaration lodged' },
  { key: 'query', label: 'Customs Query', hint: 'Held by Customs — act now', alert: true },
  { key: 'released', label: 'Released', hint: 'Cleared and delivered' },
];

function portFilterFn(f: PortFilter) {
  return (s: Shipment) => {
    if (f === 'all_active') return s.status !== 'released';
    if (f === 'released') return s.status === 'released';
    if (f === 'lodgement') return ['arrived', 'unloaded', 'in_customs'].includes(s.status);
    return s.status === 'in_customs'; // query
  };
}

export default function DashboardPage() {
  const [portFilter, setPortFilter] = useState<PortFilter>('all_active');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [wq, setWq] = useState<WorkQueue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ shipments: Shipment[] }>('/api/shipments').catch(() => ({ shipments: [] })),
      api<{ documents: Doc[] }>('/api/documents').catch(() => ({ documents: [] })),
      api<{ calcs: Calc[] }>('/api/costs').catch(() => ({ calcs: [] })),
      api<Me>('/api/auth/me').catch(() => null),
      api<WorkQueue>('/api/dashboard/workqueue').catch(() => null),
    ]).then(([s, d, c, m, w]) => { setShipments(s.shipments); setDocs(d.documents); setCalcs(c.calcs); setMe(m); setWq(w); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  }

  const active = shipments.filter(s => s.status !== 'released');
  const inCustoms = shipments.filter(s => s.status === 'in_customs');
  const released = shipments.filter(s => s.status === 'released');
  const lodgement = shipments.filter(s => ['arrived', 'unloaded', 'in_customs'].includes(s.status));
  const filterCounts: Record<PortFilter, number> = {
    all_active: active.length, lodgement: lodgement.length, query: inCustoms.length, released: released.length,
  };
  const visibleShipments = shipments.filter(portFilterFn(portFilter));

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
      {/* ── Global port-status filter (top-left, always first) ── */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter shipments by port status">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
          <Filter className="h-3.5 w-3.5" /> Port status
        </span>
        {PORT_FILTERS.map(f => {
          const on = portFilter === f.key;
          const n = filterCounts[f.key];
          return (
            <button key={f.key} title={f.hint} onClick={() => setPortFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all border',
                f.alert
                  ? on
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/30'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30'
                  : on
                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-600/25'
                    : 'bg-background text-muted-foreground border-border hover:border-teal-500/50 hover:text-foreground',
              )}>
              {f.alert && <ShieldAlert className="h-3.5 w-3.5" />}
              {f.label}
              <span className={cn('rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
                on ? (f.alert ? 'bg-white/20' : 'bg-white/20') : 'bg-muted text-muted-foreground')}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The money clock + day plan (execution first) ── */}
      {wq && (wq.demurrage.length > 0 || wq.tasks.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DemurrageClock rows={wq.demurrage} summary={wq.summary} />
          <DayPlan tasks={wq.tasks} summary={wq.summary} />
        </div>
      )}

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
              <div className="space-y-2.5">
                {alerts.slice(0, 6).map(a => <AlertCard key={a.id} alert={a} />)}
              </div>
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
            <CardTitle className="text-lg">
              {portFilter === 'all_active' ? 'Latest shipments' : `${PORT_FILTERS.find(f => f.key === portFilter)?.label} — ${visibleShipments.length}`}
            </CardTitle>
            <Link href="/dashboard/shipments"><Button size="sm" variant="ghost" className="gap-1">View all <ArrowRight className="h-4 w-4" /></Button></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleShipments.slice(0, 6).map(s => {
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
            {visibleShipments.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Ship className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="mb-3">No shipments in this state. Create one in 60 seconds.</p>
                <Link href="/dashboard/shipments"><Button className="bg-teal-600 hover:bg-teal-700"><Plus className="h-4 w-4 mr-1" /> Create shipment</Button></Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface Alert { id: string; sev: string; text: string }

/* Interactive alert card — customs-query style, one Resolve action per alert */
function AlertCard({ alert: a }: { alert: Alert }) {
  const critical = a.sev === 'critical';
  const [head, ...rest] = a.text.split(': ');
  const href = a.id.startsWith('x-') ? '/dashboard/documents' : a.id.startsWith('d-') || a.id.startsWith('c-') ? `/dashboard/shipments/${a.id.slice(2)}` : '/dashboard/shipments';
  return (
    <div className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${critical ? 'border-rose-100 dark:border-rose-500/30' : 'border-amber-100 dark:border-amber-500/30'}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${critical ? 'bg-rose-500' : 'bg-amber-500'}`} />
      <div className="flex justify-between items-start gap-3 pl-2">
        <div className="min-w-0">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${critical ? 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400' : 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-500'}`}>
            {critical ? 'Action Required' : 'Attention'}
          </span>
          <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">{head}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{rest.join(': ')}</p>
        </div>
        <Link href={href} className="shrink-0">
          <Button size="sm" className={`text-white font-bold text-xs px-3 h-8 transition-colors ${critical ? 'bg-[#0F172A] hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500' : 'bg-[#0F172A] hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500'}`}>
            Resolve
          </Button>
        </Link>
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

function DemurrageClock({ rows, summary }: { rows: DemurrageRow[]; summary: WorkQueue['summary'] }) {
  const visible = rows.slice(0, 4);
  return (
    <Card className={summary.redContainers > 0 ? 'border-rose-500/40' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className={`h-4 w-4 ${summary.redContainers > 0 ? 'text-rose-600' : 'text-teal-600'}`} />
          Demurrage clock
          {summary.totalExposureTtd > 0 && (
            <span className="ml-auto text-xs font-bold text-rose-600">exposure {fmtTTD(summary.totalExposureTtd)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map(d => {
          const cls = d.risk === 'red' ? 'border-rose-500/50 bg-rose-500/5' : d.risk === 'amber' ? 'border-amber-500/50 bg-amber-500/5' : 'border-emerald-500/30';
          const numCls = d.risk === 'red' ? 'text-rose-600' : d.risk === 'amber' ? 'text-amber-600' : 'text-emerald-600';
          return (
            <Link key={d.shipmentId} href={`/dashboard/shipments/${d.shipmentId}`}
              className={`block rounded-lg border p-2.5 hover:shadow-sm transition-shadow ${cls}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{d.reference}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{d.clientName ?? 'Internal'} · {d.containers.join(', ')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-extrabold leading-none ${numCls}`}>
                    {d.daysLeft <= 0 ? `+${Math.abs(d.daysLeft)}d` : `${d.daysLeft}d`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.daysLeft <= 0 ? `penalizing ${fmtTTD(d.perDayTtd)}/day` : 'free days left'}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground py-3">No containers at port — clock idle.</p>}
        {rows.length > visible.length && <p className="text-xs text-muted-foreground">+{rows.length - visible.length} more container(s) tracking</p>}
      </CardContent>
    </Card>
  );
}

function DayPlan({ tasks, summary }: { tasks: WorkTask[]; summary: WorkQueue['summary'] }) {
  const visible = tasks.slice(0, 5);
  const kindIcon: Record<string, React.ComponentType<{ className?: string }>> = {
    demurrage: AlarmClock, arrival: Anchor, stalled: OctagonX, permit: FileText,
    permit_expiry: ClipboardCheck, doc_expiry: FileClock, quote_followup: Banknote,
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-teal-600" />Today&apos;s plan
          <span className="ml-auto text-xs font-semibold text-muted-foreground">{summary.taskCount} action(s)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((t, i) => {
          const Icon = kindIcon[t.kind] ?? CircleCheck;
          return (
            <Link key={i} href={t.href} className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${t.priority === 0 ? 'text-rose-600' : 'text-teal-600'}`} />
              <span className="min-w-0">
                <span className={`block text-sm font-medium leading-tight ${t.priority === 0 ? 'text-rose-600' : ''}`}>{t.title}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">{t.detail}</span>
              </span>
            </Link>
          );
        })}
        {tasks.length === 0 && <p className="text-sm text-muted-foreground py-3">Nothing queued — go get more cargo.</p>}
        {tasks.length > visible.length && <p className="text-xs text-muted-foreground">+{tasks.length - visible.length} more in the queue</p>}
      </CardContent>
    </Card>
  );
}
