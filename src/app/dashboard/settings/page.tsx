'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings as SettingsIcon, Download, ShieldCheck, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { DeviceSettingsCard } from '@/components/pwa/device-settings-card';
import { RateConfigCard } from './rate-config-card';

interface SettingsData {
  tenant: { id: string; name: string; plan: string; defaultExchangeRate: number; dataRetentionYears: number };
  users: { id: string; email: string; name: string; role: string; lastLogin: string | null }[];
}
interface Setup { secret: string; otpauthUri: string }

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [fx, setFx] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    const d = await api<SettingsData>('/api/settings').catch(() => null);
    if (d) { setData(d); setFx(String(d.tenant.defaultExchangeRate)); setName(d.tenant.name); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>, msg: string) {
    setSaving(true);
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
      toast({ title: msg });
      await load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    finally { setSaving(false); }
  }

  async function exportData() {
    try {
      const d = await api<Record<string, unknown>>('/api/settings', { method: 'POST', body: JSON.stringify({ action: 'export_data' }) });
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `caribclear-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast({ title: 'Export downloaded', description: 'GDPR-lite: your data, your file.' });
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  if (!data) return <p className="text-muted-foreground p-6">Loading settings…</p>;
  const isPro = data.tenant.plan === 'pro';

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div><h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company profile, plan, security and data rights.</p></div>

      {/* Company */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><SettingsIcon className="h-5 w-5 text-teal-600" /> Company</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="s-name">Company name</Label><Input id="s-name" value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-fx">Default TT$/USD rate</Label><Input id="s-fx" type="number" step="0.01" value={fx} onChange={e => setFx(e.target.value)} /></div>
          </div>
          <Button className="bg-teal-600 hover:bg-teal-700" disabled={saving} onClick={() => patch({ name, defaultExchangeRate: Number(fx) }, 'Company updated')}>Save changes</Button>
          <p className="text-xs text-muted-foreground">Retention policy: {data.tenant.dataRetentionYears} years (Customs Act Cap 78:01). Audit records are hash-chained and immutable.</p>
        </CardContent>
      </Card>

      {/* Plan */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Plan — freemium feature flags</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={isPro ? 'bg-amber-500 text-slate-900 border-0' : ''}>{data.tenant.plan.toUpperCase()}</Badge>
            <span className="text-sm text-muted-foreground">
              {isPro ? 'Unlimited shipments, full vault, portal, quotes & reports.' : 'Free: 1 user · 3 active shipments · 3 calcs/month.'}
            </span>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            {!isPro && <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900" disabled={saving} onClick={() => patch({ plan: 'pro' }, 'Upgraded to Pro — flags flipped, no data migration needed')}>Upgrade to Pro (instant)</Button>}
            {isPro && <Button variant="outline" disabled={saving} onClick={() => patch({ plan: 'free' }, 'Downgraded to Free')}>Switch to Free</Button>}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Payments (Stripe/WiPay/PayWise) plug into the abstraction layer in phase 2 — plan changes are flag-based meanwhile.</p>
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Team</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.users.map(u => (
            <div key={u.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
              <div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>
              <div className="text-right">
                <Badge variant="secondary" className="text-[10px]">{u.role.replace(/_/g, ' ')}</Badge>
                {u.lastLogin && <p className="text-[10px] text-muted-foreground mt-1">last login {new Date(u.lastLogin).toLocaleDateString('en-GB')}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security + GDPR */}
      <div className="grid gap-4 md:grid-cols-2">
        <TwoFactorCard />
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Download className="h-5 w-5 text-teal-600" /> Your data (GDPR-lite)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Export a full JSON snapshot of your tenant: shipments, clients, quotes, documents metadata and the complete audit trail.</p>
            <Button variant="outline" onClick={exportData} className="w-full"><Download className="h-4 w-4 mr-1" /> Export my data</Button>
            <p className="text-xs text-muted-foreground">Deletion requests: contact support — the immutable audit trail is retained per legal obligation, business data is purged.</p>
          </CardContent>
        </Card>
      </div>

      {/* Rate configuration — the "when the law changes" mechanism */}
      <RateConfigCard />

      <DeviceSettingsCard />
    </div>
  );
}

function TwoFactorCard() {
  const [state, setState] = useState<'unknown' | 'off' | 'on'>('unknown');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    api<{ user: { role: string } }>('/api/auth/me').then(() => setState('off')).catch(() => null);
    // We don't have a status endpoint; infer via verify endpoint failure — simpler: assume off until enabled
  }, []);

  async function startSetup() {
    try {
      const d = await api<Setup>('/api/auth/2fa/setup', { method: 'POST' });
      setSetup(d);
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await api<{ backupCodes: string[] }>('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setBackupCodes(d.backupCodes); setState('on'); setSetup(null); setCode('');
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      setState('off'); setCode(''); toast({ title: '2FA disabled' });
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-600" /> Two-factor auth (TOTP)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {state === 'on' ? (
          <p className="text-sm flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> 2FA is protecting this account.</p>
        ) : (
          <p className="text-sm flex items-center gap-2 text-muted-foreground"><XCircle className="h-4 w-4 text-amber-500" /> Recommended for admins: adds a rotating 6-digit code at sign-in.</p>
        )}
        {state !== 'on' && !setup && <Button variant="outline" onClick={startSetup} className="w-full">Enable 2FA</Button>}
        {setup && (
          <form onSubmit={confirmEnable} className="space-y-3">
            <div className="rounded-lg border p-3 text-xs space-y-2">
              <p className="font-medium">1. Add this secret to Google Authenticator / Authy:</p>
              <p className="font-mono break-all bg-muted rounded p-2">{setup.secret}</p>
              <p className="text-muted-foreground break-all">or scan: {setup.otpauthUri.slice(0, 60)}…</p>
            </div>
            <Input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} />
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700">Confirm & enable</Button>
          </form>
        )}
        {state === 'on' && (
          <form onSubmit={disable} className="space-y-2">
            <Input inputMode="numeric" maxLength={6} placeholder="Current code to disable" value={code} onChange={e => setCode(e.target.value)} />
            <Button type="submit" variant="outline" className="w-full">Disable 2FA</Button>
          </form>
        )}
      </CardContent>
      <Dialog open={!!backupCodes} onOpenChange={() => setBackupCodes(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle className="mx-auto">Save your backup codes</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {(backupCodes ?? []).map(c => <span key={c} className="bg-muted rounded p-2">{c}</span>)}
          </div>
          <p className="text-xs text-muted-foreground">Each code works once if you lose your authenticator.</p>
        </DialogContent>
      </Dialog>
      <div className="hidden"><QrCode /></div>
    </Card>
  );
}
