'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollText, History, Loader2, Landmark } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * Rate Configuration — lets the broker admin record a NEW version of the
 * legal rate snapshot whenever a national instrument changes (budget, legal
 * notice, fee schedule). No code, no deploy: the engine reads the active
 * version from the database. Bracket tables are edited as JSON with
 * server-side validation (normalizeRateConfig) so a typo can never poison
 * the duty engine.
 */

type Num = number;

interface Snapshot {
  version: Num; vatStandard: Num;
  dutyPetrol: Array<{ maxCc: number; rate: number }>;
  dutyDiesel: Array<{ maxCc: number; rate: number }>;
  dutyEv: Num;
  evCifCeilingTtd: Num; evDutyOverCeiling: Num; evUsedAgeLimitYears: Num;
  evMvtNewTtdPerKw: Num; evMvtUsedTtdPerKw: Num;
  hybridMaxCc: Num; hybridMaxMotorKw: Num; hybridUsedAgeLimitYears: Num;
  hybridMvtNewTtdPerCc: Num; hybridMvtUsedTtdPerCc: Num;
  commHybridMvtExemptMaxCc: Num;
  cngPrivateMvtNewTtdPerCc: Num; cngPrivateMvtUsedTtdPerCc: Num;
  cngUsedAgeLimitYears: Num; cngCommDutyExemptMaxCc: Num;
  returningNationalDutyRelief: boolean; returningNationalMvtFull: boolean;
  usedPrivateAgeLimitYears: Num; usedLightCommercialAgeLimitYears: Num;
  exciseBrackets: Array<{ minAge: number; maxAge: number | null; rate: number }>;
  exciseIncludedInVatBase: boolean;
  mvtStandardPerCc: Array<{ maxCc: number; ttdPerCc: number }>;
  mvtForeignUsedFactor: Num;
  customsDeclarationFeeTtd: Num;
  containerExamFee: { size20: Num; size40: Num };
  environmentalTyreTaxTtd: Num;
  singleUsePlasticsRate: Num;
  onlinePurchaseTaxRate: Num;
}

interface RatesData {
  config: Snapshot;
  version: number;
  effectiveFrom: string | null;
  notes: string | null;
  history: Array<{ id: string; version: number; effectiveFrom: string; notes: string | null; isActive: boolean }>;
}

const NUM_FIELDS: Array<{ group: string; key: keyof Snapshot | string; label: string; hint?: string; step?: string }> = [
  { group: 'General taxes & fees', key: 'vatStandard', label: 'VAT standard rate', hint: 'VAT Act Chap 75:06 — 12.5% since Feb 2016', step: '0.1' },
  { group: 'General taxes & fees', key: 'customsDeclarationFeeTtd', label: 'Customs declaration fee (TT$)', hint: 'Per declaration' },
  { group: 'General taxes & fees', key: 'containerExamFee.size20', label: 'Container exam 20ft (TT$)' },
  { group: 'General taxes & fees', key: 'containerExamFee.size40', label: 'Container exam 40ft/40HC (TT$)' },
  { group: 'General taxes & fees', key: 'environmentalTyreTaxTtd', label: 'Tyre tax (TT$ per tyre)' },
  { group: 'General taxes & fees', key: 'singleUsePlasticsRate', label: 'Single-use plastics tax (% of CIF)' },
  { group: 'General taxes & fees', key: 'onlinePurchaseTaxRate', label: 'Online purchase tax (%)' },
  { group: 'General taxes & fees', key: 'mvtForeignUsedFactor', label: 'Foreign-used MVT factor', hint: '0.75 = MVT × 75% for foreign-used (Appendix A item 6)', step: '0.05' },

  { group: 'Electric vehicles', key: 'dutyEv', label: 'EV base customs duty (%)', hint: 'HS 8703.90' },
  { group: 'Electric vehicles', key: 'evCifCeilingTtd', label: 'EV concession CIF ceiling (TT$)', hint: 'Concessions apply below this CIF' },
  { group: 'Electric vehicles', key: 'evDutyOverCeiling', label: 'EV duty over ceiling (%)' },
  { group: 'Electric vehicles', key: 'evUsedAgeLimitYears', label: 'EV used age limit (years)' },
  { group: 'Electric vehicles', key: 'evMvtNewTtdPerKw', label: 'EV MVT new — TT$ per kW' },
  { group: 'Electric vehicles', key: 'evMvtUsedTtdPerKw', label: 'EV MVT used — TT$ per kW' },

  { group: 'Hybrid & CNG', key: 'hybridMaxCc', label: 'Hybrid concession max cc' },
  { group: 'Hybrid & CNG', key: 'hybridMaxMotorKw', label: 'Hybrid concession max motor kW' },
  { group: 'Hybrid & CNG', key: 'hybridUsedAgeLimitYears', label: 'Hybrid used age limit (years)' },
  { group: 'Hybrid & CNG', key: 'hybridMvtNewTtdPerCc', label: 'Hybrid MVT new — TT$ per cc' },
  { group: 'Hybrid & CNG', key: 'hybridMvtUsedTtdPerCc', label: 'Hybrid MVT used — TT$ per cc' },
  { group: 'Hybrid & CNG', key: 'commHybridMvtExemptMaxCc', label: 'Commercial hybrid MVT-exempt max cc' },
  { group: 'Hybrid & CNG', key: 'cngPrivateMvtNewTtdPerCc', label: 'CNG private MVT new — TT$ per cc' },
  { group: 'Hybrid & CNG', key: 'cngPrivateMvtUsedTtdPerCc', label: 'CNG private MVT used — TT$ per cc' },
  { group: 'Hybrid & CNG', key: 'cngUsedAgeLimitYears', label: 'CNG used age limit (years)' },
  { group: 'Hybrid & CNG', key: 'cngCommDutyExemptMaxCc', label: 'CNG commercial duty-exempt max cc' },

  { group: 'Used vehicles & returning nationals', key: 'usedPrivateAgeLimitYears', label: 'Used private age limit (years)', hint: 'Budget FY2026: 3 → 6' },
  { group: 'Used vehicles & returning nationals', key: 'usedLightCommercialAgeLimitYears', label: 'Used light-commercial age limit (years)', hint: 'Budget FY2026: 7 → 10' },
];

const BOOL_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'returningNationalDutyRelief', label: 'Returning nationals keep duty relief (s.45A)', hint: 'One vehicle, ≥5 years abroad, 2-year transfer clawback' },
  { key: 'returningNationalMvtFull', label: 'Returning nationals pay FULL MVT', hint: 'Revoked 4 Aug 2026 — no more 75% reduction' },
  { key: 'exciseIncludedInVatBase', label: 'Include excise in the VAT base', hint: 'Flip only if officially confirmed — affects every used-vehicle VAT line' },
];

const JSON_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'dutyPetrol', label: 'Petrol duty brackets (HS 8703.21-24)', hint: '[{"maxCc":1599,"rate":25},{"maxCc":2000,"rate":35},{"maxCc":3000,"rate":60},{"maxCc":99999,"rate":67.5}]' },
  { key: 'dutyDiesel', label: 'Diesel duty brackets (HS 8703.31-33)', hint: '[{"maxCc":1500,"rate":35},{"maxCc":2000,"rate":40},{"maxCc":2500,"rate":60},{"maxCc":99999,"rate":67.5}]' },
  { key: 'mvtStandardPerCc', label: 'MVT per-cc brackets (Appendix A item 1)', hint: '[{"maxCc":99999,"ttdPerCc":60}] — per engine cc' },
  { key: 'exciseBrackets', label: 'Used-vehicle excise by age', hint: '[{"minAge":8,"maxAge":10,"rate":18},{"minAge":10,"maxAge":null,"rate":35}] — maxAge null = open-ended' },
];

export function RateConfigCard() {
  const [data, setData] = useState<RatesData | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [effFrom, setEffFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const d = await api<RatesData>('/api/settings/rates').catch(() => null);
    if (d) {
      setData(d);
      setDraft(JSON.parse(JSON.stringify(d.config)));
      setDirty(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function get(path: string): unknown {
    const [head, sub] = path.split('.');
    const obj = draft[head];
    if (sub && obj && typeof obj === 'object') return (obj as Record<string, unknown>)[sub];
    return obj;
  }
  function set(path: string, v: unknown) {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
      const [head, sub] = path.split('.');
      if (sub && next[head] && typeof next[head] === 'object') (next[head] as Record<string, unknown>)[sub] = v;
      else next[head] = v;
      return next;
    });
    setDirty(true);
  }

  async function saveNewVersion() {
    if (!notes.trim()) { toast({ title: 'Cite the legal instrument', description: 'e.g. "L.N. 613 of 2026, in force 4 Aug 2026" — auditors will ask.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const parsed = parseJsonFields(draft);
      if (parsed.error) { toast({ title: 'Bracket table error', description: parsed.error, variant: 'destructive' }); return; }
      const d = await api<{ version: number }>('/api/settings/rates', {
        method: 'POST',
        body: JSON.stringify({ config: parsed.config, notes, effectiveFrom: effFrom || undefined }),
      });
      toast({ title: `Version ${d.version} saved`, description: 'New calculations use it from the effective date. Saved calculations keep their snapshot.' });
      setNotes(''); setEffFrom('');
      await load();
    } catch (err) {
      toast({ title: 'Not saved', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  if (!data) return null;
  const groups = [...new Set(NUM_FIELDS.map((f) => f.group))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
          <Landmark className="h-5 w-5 text-teal-600" /> Rate configuration
          <Badge variant="secondary" className="text-[10px]">v{data.version || '—'}</Badge>
          {dirty && <Badge className="bg-amber-500 text-slate-900 border-0 text-[10px]">unsaved draft</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When a budget, legal notice or fee schedule changes nationally, record it here as a new version citing the
          instrument. The duty engine applies the active version to new calculations — <b>no code change, no deploy</b>.
          Previously saved calculations keep their own snapshot, so history stays truthful.
        </p>
        {data.effectiveFrom && (
          <p className="text-xs text-muted-foreground">
            Active version effective from <b>{new Date(data.effectiveFrom).toLocaleDateString('en-GB')}</b>
            {data.notes ? ` — ${data.notes}` : ''}
          </p>
        )}

        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {NUM_FIELDS.filter((f) => f.group === g).map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">{f.label}</span>
                  <Input
                    type="number" step={f.step ?? 'any'} className="mt-0.5 h-8 text-sm"
                    value={String(get(f.key) ?? '')} onChange={(e) => set(f.key, e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                  {f.hint && <span className="text-[10px] text-muted-foreground">{f.hint}</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {BOOL_FIELDS.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm rounded-lg border p-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={!!get(f.key)} onChange={(e) => set(f.key, e.target.checked)} />
                <span><span className="font-medium">{f.label}</span><br /><span className="text-[10px] text-muted-foreground">{f.hint}</span></span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bracket tables (JSON)</p>
          {JSON_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] font-medium text-muted-foreground">{f.label}</span>
              <textarea
                rows={2} spellCheck={false}
                className="mt-0.5 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs font-mono"
                value={JSON.stringify(get(f.key) ?? [])}
                onChange={(e) => {
                  try { set(f.key, JSON.parse(e.target.value)); } catch { /* keep old until valid */ }
                }}
              />
              <span className="text-[10px] text-muted-foreground">{f.hint}</span>
            </label>
          ))}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Justification — cite the instrument *</span>
            <Input className="mt-0.5 h-9" placeholder="e.g. L.N. 613 of 2026, in force 4 Aug 2026 — EV/CNG concessions amended" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Effective from</span>
            <Input type="date" className="mt-0.5 h-9" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} />
          </label>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700 w-full sm:w-auto" disabled={saving} onClick={saveNewVersion}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ScrollText className="h-4 w-4 mr-1" />}
          Save as new version (v{(data.version || 0) + 1})
        </Button>

        {data.history.length > 1 && (
          <div className="pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} className="text-muted-foreground">
              <History className="h-4 w-4 mr-1" /> {showHistory ? 'Hide' : 'Show'} version history ({data.history.length})
            </Button>
            {showHistory && (
              <ul className="mt-2 space-y-1.5 text-xs">
                {data.history.map((h) => (
                  <li key={h.id} className="flex gap-2 items-start">
                    <Badge variant={h.isActive ? 'default' : 'secondary'} className="text-[10px] shrink-0">v{h.version}{h.isActive ? ' active' : ''}</Badge>
                    <span className="text-muted-foreground">{new Date(h.effectiveFrom).toLocaleDateString('en-GB')} — {h.notes || '(no note)'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Parse the JSON textarea fields before sending — returns a per-field error if invalid. */
function parseJsonFields(draft: Record<string, unknown>): { config?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  for (const f of JSON_FIELDS) {
    const val = out[f.key];
    if (val === undefined || val === null) return { error: `${f.label} is empty` };
    if (!Array.isArray(val) || val.length === 0) return { error: `${f.label} must be a non-empty array` };
    for (const row of val) {
      if (typeof row !== 'object' || row === null) return { error: `${f.label}: each bracket must be an object like {"maxCc":1599,"rate":25}` };
    }
  }
  return { config: out };
}
