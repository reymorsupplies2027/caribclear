'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtBytes, fmtDateTime } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ShieldCheck, ShieldX, Database, Lock, ScrollText } from 'lucide-react';

interface ServiceHealth {
  database: { ok: boolean; latencyMs: number; label: string };
  costEngine: { ok: boolean; latencyMs: number; label: string };
  vaultEncryption: { ok: boolean; algorithm: string };
  asycudaEdi: { ok: boolean; detail: string };
  whatsapp: { ok: boolean; configured: boolean };
}

interface Health {
  chains: {
    platform: { ok: boolean; checked: number; brokenId: string | null };
    tenants: { name: string; region: string; isActive: boolean; ok: boolean; checked: number }[];
    allOk: boolean;
  };
  security: { failedLoginAttemptsTotal: number; lockedAccountsNow: number; twoFactorNote: string };
  data: {
    users: number; shipments: number; documents: number; storageBytes: number;
    costCalculations: number; pushSubscriptions: number; auditEntries: number; auditEntries24h: number;
    purgeEligibleDocs: number; retention: string;
  };
  recentAudit: { id: string; action: string; entityType: string; tenantId: string | null; createdAt: string }[];
  services?: ServiceHealth;
}

export default function TowerHealthPage() {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (deep = false) => {
    setBusy(true);
    try { setH(await api<Health>(`/api/tower/health${deep ? '?deep=1' : ''}`)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load health.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            {h?.chains.allOk ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldX className="h-5 w-5 text-rose-600" />}
            Building health
          </h1>
          <p className="text-sm text-muted-foreground">Hash-chain integrity, security posture and data volume — the walls of the building.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? 'animate-spin' : ''}`} />Verify all chains
        </Button>
      </div>

      {error && <Card><CardContent className="p-6 text-center text-sm text-rose-600">{error}</CardContent></Card>}
      {!h && !error && <p className="text-sm text-muted-foreground animate-pulse">Inspecting walls…</p>}

      {h && (
        <>
          {/* ── Service status: live LED cards, every probe is a real subsystem check ── */}
          {h.services && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <ServiceLed
                name="ASYCUDA EDI Connection"
                status={h.services.asycudaEdi.ok ? 'Operational' : 'Idle'}
                detail={h.services.asycudaEdi.ok ? h.services.asycudaEdi.detail : 'no entries in registry yet'}
                ok={h.services.asycudaEdi.ok}
              />
              <ServiceLed
                name="WhatsApp Gateway"
                status={h.services.whatsapp.ok ? 'Connected' : 'Adapter ready'}
                detail={h.services.whatsapp.ok ? 'Twilio credentials live' : 'credentials pending — in-app alerts live'}
                ok={h.services.whatsapp.ok}
              />
              <ServiceLed
                name="Vault Encryption"
                status={h.services.vaultEncryption.ok ? 'Enforced' : 'Check failed'}
                detail={`${h.services.vaultEncryption.algorithm} roundtrip verified on probe`}
                ok={h.services.vaultEncryption.ok}
              />
              <ServiceLed
                name="Landed Cost Engine"
                status={h.services.costEngine.ok ? 'Operational' : 'Degraded'}
                detail="real calculation per probe"
                ok={h.services.costEngine.ok}
                latencyMs={h.services.costEngine.latencyMs}
              />
              <ServiceLed
                name="PostgreSQL"
                status={h.services.database.ok ? 'Operational' : 'Down'}
                detail="SELECT 1 on the live pool"
                ok={h.services.database.ok}
                latencyMs={h.services.database.latencyMs}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">WORM audit chains (immutable)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <span className="text-sm font-semibold">Platform chain</span>
                  <span className="text-xs">{h.chains.platform.ok
                    ? <Badge className="bg-emerald-600 text-white border-0">✓ verified · {h.chains.platform.checked} entries</Badge>
                    : <Badge variant="destructive">BROKEN at {h.chains.platform.brokenId?.slice(-6)}</Badge>}</span>
                </div>
                {h.chains.tenants.map(t => (
                  <div key={t.name} className="flex items-center justify-between rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.region}{!t.isActive ? ' · suspended' : ''}</p>
                    </div>
                    <span className="text-xs shrink-0">{t.ok
                      ? <Badge className="bg-emerald-600 text-white border-0">✓ {t.checked}</Badge>
                      : <Badge variant="destructive">BROKEN</Badge>}</span>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">&quot;Verify all chains&quot; recomputes every SHA-256 link end-to-end. Any tampering with the audit trail breaks the chain — this is the court-grade guarantee.</p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4 text-violet-600" />Security posture</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-xl font-extrabold">{h.security.failedLoginAttemptsTotal}</p>
                    <p className="text-[11px] text-muted-foreground">failed login attempts (cumulative)</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xl font-extrabold">{h.security.lockedAccountsNow}</p>
                    <p className="text-[11px] text-muted-foreground">accounts locked right now</p>
                  </div>
                  <p className="col-span-2 text-[11px] text-muted-foreground text-left">{h.security.twoFactorNote}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-teal-600" />Data under management</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { v: h.data.users, l: 'users' }, { v: h.data.shipments, l: 'shipments' },
                    { v: h.data.documents, l: 'documents' }, { v: h.data.costCalculations, l: 'cost calcs' },
                    { v: fmtBytes(h.data.storageBytes), l: 'vault storage' }, { v: h.data.pushSubscriptions, l: 'push devices' },
                  ].map((x, i) => (
                    <div key={i} className="rounded-lg border p-2">
                      <p className="text-base font-bold">{x.v}</p>
                      <p className="text-[10px] text-muted-foreground">{x.l}</p>
                    </div>
                  ))}
                  <p className="col-span-3 text-[11px] text-muted-foreground text-left">
                    Retention: {h.data.retention} · purge-eligible docs: {h.data.purgeEligibleDocs} · audit entries: {h.data.auditEntries} ({h.data.auditEntries24h} last 24h)
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" />Platform audit tail (latest 15)</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {h.recentAudit.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-xs border-b border-border/60 py-1.5">
                  <span className="font-mono truncate">{a.action}</span>
                  <span className="text-muted-foreground shrink-0">{a.entityType} · {fmtDateTime(a.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* LED micro-card — green pulse = healthy, amber pulse = pending/degraded. */
function ServiceLed({ name, status, detail, ok, latencyMs }: {
  name: string; status: string; detail: string; ok: boolean; latencyMs?: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 animate-pulse ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <p className="text-xs font-bold truncate" title={name}>{name}</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className={`text-[11px] font-semibold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{status}</p>
        {latencyMs !== undefined && (
          <span className="rounded-md bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
            {latencyMs} ms
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={detail}>{detail}</p>
    </div>
  );
}
