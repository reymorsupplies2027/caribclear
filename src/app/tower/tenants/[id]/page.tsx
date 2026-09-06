'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtUSD, fmtDate, fmtDateTime, fmtBytes } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, ArrowLeft, Save, Ban, Play, CreditCard, Users, Ship,
  FileText, Calculator, Receipt, MapPin, StickyNote, ShieldCheck,
} from 'lucide-react';

interface Detail {
  tenant: {
    id: string; name: string; slug: string; plan: string; priceUsd: number | null;
    region: string; city: string | null; contactEmail: string | null; notes: string | null;
    isActive: boolean; createdAt: string; trialEndsAt: string | null;
    subscriptionEndsAt: string | null; timezone: string; effectivePriceUsd: number;
  };
  stats: { users: number; clients: number; activeShipments: number; documents: number; storageBytes: number; costCalcs: number; quotes: number; quotesApproved: number; mrrUsd: number };
  users: { id: string; email: string; name: string; role: string; isActive: boolean; lastLogin: string | null; createdAt: string }[];
  invoices: { id: string; amount: number; currency: string; status: string; period: string | null; dueDate: string; paidAt: string | null }[];
  recentShipments: { id: string; reference: string; status: string; updatedAt: string }[];
  recentAudit: { id: string; action: string; entityType: string; createdAt: string }[];
}

const INVOICE_STATUS_CLS: Record<string, string> = {
  paid: 'bg-emerald-600 text-white border-0',
  pending: 'bg-amber-500 text-slate-900 border-0',
  overdue: 'bg-rose-600 text-white border-0',
};

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<Detail>(`/api/tower/tenants/${id}`);
      setD(data);
      setNotes(data.tenant.notes ?? '');
      setCity(data.tenant.city ?? '');
      setRegion(data.tenant.region);
      setContact(data.tenant.contactEmail ?? '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load tenant.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>, msg: string) {
    setSaving(true);
    try {
      await api(`/api/tower/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast({ title: msg });
      await load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function markInvoice(invId: string, status: string) {
    try {
      await api(`/api/tower/invoices/${invId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast({ title: status === 'paid' ? 'Invoice marked paid' : `Invoice → ${status}` });
      await load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  if (error) {
    return (
      <Card><CardContent className="p-8 text-center">
        <p className="text-sm text-rose-600 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/tower/tenants')}><ArrowLeft className="h-4 w-4 mr-1" />Back to book</Button>
      </CardContent></Card>
    );
  }
  if (!d) return <p className="text-sm text-muted-foreground animate-pulse">Opening dossier…</p>;
  const t = d.tenant;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => router.push('/tower/tenants')}>
            <ArrowLeft className="h-4 w-4 mr-1" />Tenant book
          </Button>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2 flex-wrap">
            <Building2 className="h-5 w-5 text-violet-600" />{t.name}
            <Badge className={t.plan === 'pro' ? 'bg-amber-500 text-slate-900 border-0' : ''}>{t.plan}</Badge>
            {!t.isActive && <Badge variant="destructive">suspended</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground flex flex-wrap gap-x-3">
            <span><MapPin className="inline h-3.5 w-3.5" /> {t.city || '—'}, {t.region}</span>
            <span>· moved in {fmtDate(t.createdAt)}</span>
            <span>· /{t.slug}</span>
            <span>· {t.timezone}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={() => patch({ plan: t.plan === 'pro' ? 'free' : 'pro' }, 'Plan updated')}>
            <CreditCard className="h-4 w-4 mr-1" />{t.plan === 'pro' ? 'Set Free' : 'Set Pro'}
          </Button>
          {t.isActive ? (
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => patch({ isActive: false }, 'Tenant suspended')}>
              <Ban className="h-4 w-4 mr-1" />Suspend
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving} onClick={() => patch({ isActive: true }, 'Tenant reactivated')}>
              <Play className="h-4 w-4 mr-1" />Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
        {[
          { icon: Users, v: d.stats.users, l: 'users' },
          { icon: Ship, v: d.stats.activeShipments, l: 'active shipments' },
          { icon: FileText, v: d.stats.documents, l: `docs · ${fmtBytes(d.stats.storageBytes)}` },
          { icon: Calculator, v: d.stats.costCalcs, l: 'cost calcs' },
          { icon: Receipt, v: d.stats.quotesApproved, l: `of ${d.stats.quotes} quotes approved` },
          { icon: CreditCard, v: d.stats.mrrUsd > 0 ? fmtUSD(d.stats.mrrUsd) : '$0', l: 'MRR contribution' },
        ].map((s, i) => (
          <Card key={i}><CardContent className="p-3">
            <s.icon className="h-4 w-4 text-violet-600 mb-1" />
            <p className="text-lg font-extrabold leading-tight">{s.v}</p>
            <p className="text-[10px] text-muted-foreground">{s.l}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Invoices */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Subscription invoices</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{fmtUSD(inv.amount)} <span className="text-muted-foreground font-normal">· {inv.period ?? '—'}</span></p>
                  <p className="text-[11px] text-muted-foreground">due {fmtDate(inv.dueDate)}{inv.paidAt ? ` · paid ${fmtDate(inv.paidAt)}` : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={INVOICE_STATUS_CLS[inv.status] ?? ''}>{inv.status}</Badge>
                  {inv.status !== 'paid'
                    ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markInvoice(inv.id, 'paid')}>Mark paid</Button>
                    : <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markInvoice(inv.id, 'pending')}>Undo</Button>}
                </div>
              </div>
            ))}
            {d.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet — generate them from the Billing book.</p>}
          </CardContent>
        </Card>

        {/* Landlord private controls */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><StickyNote className="h-4 w-4 text-violet-600" />Landlord&apos;s private file</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="td-region">Region</label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="td-region"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Trinidad', 'Tobago', 'Jamaica', 'Barbados', 'Guyana', 'CARICOM'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="td-city">City</label>
                <Input id="td-city" value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="td-contact">Contact email</label>
              <Input id="td-contact" type="email" value={contact} onChange={e => setContact(e.target.value)} placeholder="billing@tenant.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="td-notes">Private notes (never shown to tenant)</label>
              <Textarea id="td-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Negotiation history, payment behavior, references…" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={saving} onClick={() => patch({ notes, city, region, contactEmail: contact }, 'Tenant file saved')}>
                <Save className="h-4 w-4 mr-1" />Save file
              </Button>
              <span className="text-xs text-muted-foreground">Price override: <Input className="inline-block h-7 w-24 text-xs" defaultValue={t.priceUsd ?? ''} onBlur={e => {
                const v = e.target.value.trim();
                patch({ priceUsd: v === '' ? null : Number(v) }, 'Price override saved');
              }} /></span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Users */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Users ({d.users.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {d.users.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{u.email} · since {fmtDate(u.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">last login {u.lastLogin ? fmtDateTime(u.lastLogin) : 'never'}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audit tail */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Recent audit trail</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {d.recentAudit.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs border-b border-border/60 pb-1.5">
                <span className="font-mono truncate">{a.action}</span>
                <span className="text-muted-foreground shrink-0">{fmtDateTime(a.createdAt)}</span>
              </div>
            ))}
            {d.recentAudit.length === 0 && <p className="text-sm text-muted-foreground">No audit entries yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
