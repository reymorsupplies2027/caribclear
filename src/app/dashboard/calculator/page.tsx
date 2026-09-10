'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtTTD, fmtUSD, fmtDate } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, AlertTriangle, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { LegalTooltip } from '@/components/legal-tooltip';

/* Maps an engine cost-line key to its legal explanation (Cap 78:01 et al.) */
const LEGAL_LINE_MAP: Record<string, string> = {
  cif: 'cif', duty: 'duty', mvt: 'mvt', vat: 'vat',
  declaration_fee: 'fees', container_exam: 'fees',
  tyre_tax: 'environmental', plastics_tax: 'environmental', online_tax: 'online',
};

interface CostLine { key: string; label: string; basis: string; amount: number; kind: string; order: number }
interface Result {
  cifUsd: number; cifTtd: number; exchangeRate: number;
  dutyTtd: number; mvtTtd: number; exciseTtd: number; vatTtd: number; feesTtd: number; environmentalTtd: number;
  totalTtd: number; landedOverCifPct: number; lines: CostLine[]; warnings: string[];
  vehicleConcession?: { regime: string; instruments: string[] };
}
interface HsCode { id: string; code: string; description: string; cetRate: number; vatExempt: boolean; notes: string | null }
interface Calc { id: string; name: string; hsCode: string; totalTtd: number; createdAt: string }

export default function CalculatorPage() {
  const [codes, setCodes] = useState<HsCode[]>([]);
  const [history, setHistory] = useState<Calc[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    hsCode: '8703', fobUsd: '9500', freightUsd: '1800', insuranceUsd: '190',
    exchangeRate: '', isVehicle: false, vehicleCc: '1500', vehicleFuel: 'petrol', vehicleUsed: true, vehicleYear: '2021',
    vehicleKw: '', vehicleUse: 'private', vehicleReturning: false,
    containers: '1x40ft', tyreCount: '', isOnlinePurchase: false, isPlastics: false, name: '',
  });
  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api<{ codes: HsCode[] }>('/api/hs?q=').then(d => setCodes(d.codes)).catch(() => null);
    api<{ calcs: Calc[] }>('/api/costs').then(d => setHistory(d.calcs.slice(0, 8))).catch(() => null);
  }, []);

  const calculate = useCallback(async (persist: boolean) => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        hsCode: form.hsCode,
        fobUsd: Number(form.fobUsd) || 0,
        freightUsd: Number(form.freightUsd) || 0,
        insuranceUsd: Number(form.insuranceUsd) || 0,
        exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : undefined,
        containers: form.containers === 'none' ? [] : form.containers.split(',').map(x => x.trim()).filter(Boolean),
        isOnlinePurchase: form.isOnlinePurchase,
        isSingleUsePlastics: form.isPlastics,
        tyreCount: form.tyreCount ? Number(form.tyreCount) : undefined,
      };
      if (form.isVehicle) payload.vehicle = {
        fuel: form.vehicleFuel, engineCc: Number(form.vehicleCc) || 0,
        used: form.vehicleUsed, yearOfManufacture: form.vehicleYear ? Number(form.vehicleYear) : undefined,
        motorKw: form.vehicleKw ? Number(form.vehicleKw) : undefined,
        vehicleUse: form.vehicleUse === 'commercial' ? 'commercial' : 'private',
        returningNational: form.vehicleReturning,
      };
      if (persist) payload.name = form.name || undefined;
      const data = await api<{ result: Result }>(persist ? '/api/costs' : '/api/costs?preview=1', { method: 'POST', body: JSON.stringify(payload) });
      setResult(data.result);
      if (persist) { toast({ title: 'Calculation saved', description: fmtTTD(data.result.totalTtd) }); }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Calculation failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }, [form]);

  const selected = codes.find(c => c.code.startsWith(form.hsCode.slice(0, 4)));

  return (
    <div className="grid gap-5 max-w-7xl mx-auto lg:grid-cols-5">
      {/* INPUT */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Calculator className="h-5 w-5 text-teal-600" /> Landed cost engine</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hs">HS code (6 digits) *</Label>
            <Input id="hs" value={form.hsCode} onChange={e => set('hsCode', e.target.value)} placeholder="8703" />
            {selected && <p className="text-xs text-muted-foreground">{selected.code} — {selected.description} · CET {selected.cetRate}%{selected.vatExempt ? ' · VAT exempt' : ''}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field k="fobUsd" label="FOB USD" v={form} set={set} />
            <Field k="freightUsd" label="Freight USD" v={form} set={set} />
            <Field k="insuranceUsd" label="Insurance USD" v={form} set={set} />
          </div>
          <Field k="exchangeRate" label="TT$/USD (blank = tenant default 6.80)" v={form} set={set} />

          <div className="flex items-center gap-2">
            <input type="checkbox" id="veh" checked={form.isVehicle} onChange={e => set('isVehicle', e.target.checked)} className="h-4 w-4 accent-teal-600" />
            <Label htmlFor="veh" className="font-normal">Vehicle (HS 8703) — apply cc brackets & Motor Vehicle Tax</Label>
          </div>
          {form.isVehicle && (
            <div className="space-y-2 rounded-lg border p-3 bg-teal-600/5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1"><Label className="text-xs">Fuel</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.vehicleFuel} onChange={e => set('vehicleFuel', e.target.value)}>
                    <option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="ev">Electric (EV)</option><option value="hybrid">Hybrid</option><option value="cng">CNG</option>
                  </select></div>
                <Field k="vehicleCc" label="Engine cc" v={form} set={set} />
                <div className="space-y-1"><Label className="text-xs">Condition</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.vehicleUsed ? 'used' : 'new'} onChange={e => set('vehicleUsed', e.target.value === 'used')}>
                    <option value="used">Foreign-used</option><option value="new">New</option>
                  </select></div>
                <Field k="vehicleYear" label="Year" v={form} set={set} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(form.vehicleFuel === 'ev' || form.vehicleFuel === 'hybrid') && (
                  <Field k="vehicleKw" label="Electric motor kW (concessions)" v={form} set={set} />
                )}
                <div className="space-y-1"><Label className="text-xs">Use</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.vehicleUse} onChange={e => set('vehicleUse', e.target.value)}>
                    <option value="private">Private</option><option value="commercial">Commercial</option>
                  </select></div>
                <label className="flex items-end gap-2 text-sm pb-2">
                  <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={form.vehicleReturning} onChange={e => set('vehicleReturning', e.target.checked)} />
                  Returning national (s.45A)
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">EV/hybrid concessions require the motor kW — L.N. 247/2024 caps the hybrid motor at 105 kW; EV MVT is charged per kW (Part IA item 8).</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="cont">Containers</Label>
              <select id="cont" className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.containers} onChange={e => set('containers', e.target.value)}>
                <option value="none">None / LCL</option><option value="20ft">1 × 20ft</option><option value="40ft">1 × 40ft</option><option value="40hc">1 × 40HC</option><option value="20ft,20ft">2 × 20ft</option><option value="40ft,20ft">40ft + 20ft</option>
              </select></div>
            <Field k="tyreCount" label="Tyres (HS 4011)" v={form} set={set} type="number" />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={form.isOnlinePurchase} onChange={e => set('isOnlinePurchase', e.target.checked)} /> Online purchase (7%)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={form.isPlastics} onChange={e => set('isPlastics', e.target.checked)} /> Single-use plastics (5%)</label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={() => calculate(false)} disabled={busy} variant="outline" className="flex-1">Preview</Button>
            <Button onClick={() => calculate(true)} disabled={busy} className="flex-1 bg-teal-600 hover:bg-teal-700"><Save className="h-4 w-4 mr-1" /> Calculate & save</Button>
          </div>
          {busy && <Skeleton className="h-1" />}

          {history.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Recent saved calculations</p>
              <ul className="space-y-1.5 text-sm">
                {history.map(c => (
                  <li key={c.id} className="flex justify-between">
                    <span className="truncate text-muted-foreground">{fmtDate(c.createdAt)} · {c.hsCode}</span>
                    <span className="font-medium">{fmtTTD(c.totalTtd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RESULT */}
      <div className="lg:col-span-3 space-y-4">
        {!result ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
            Enter your shipment values and press <strong>Preview</strong> —<br />the official T&T formulas produce a line-by-line breakdown.
          </CardContent></Card>
        ) : (
          <>
            {result.warnings.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="p-4 space-y-1.5">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-sm flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /> {w}</p>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-lg">Breakdown — line by line</CardTitle>
                  <Badge className="bg-teal-600 text-white border-0">+{result.landedOverCifPct}% over CIF</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 font-medium">Concept</th>
                      <th className="py-2 font-medium hidden sm:table-cell">Basis</th>
                      <th className="py-2 font-medium text-right">TTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map(l => (
                      <tr key={l.key} className={`border-b last:border-0 ${l.kind === 'value' ? 'bg-teal-600/5 font-semibold' : ''}`}>
                        <td className="py-2.5 pr-2">
                          <span className="inline-flex items-center gap-1.5">{l.label}
                            <LegalTooltip lineKey={LEGAL_LINE_MAP[l.key] ?? ''} />
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-xs text-muted-foreground hidden sm:table-cell">{l.basis}</td>
                        <td className={`py-2.5 text-right tabular-nums ${l.kind === 'value' ? 'font-bold' : ''}`}>{fmtTTD(l.amount)}</td>
                      </tr>
                    ))}
                    <tr className="text-base font-extrabold">
                      <td className="py-3">TOTAL LANDED COST</td>
                      <td className="hidden sm:table-cell" />
                      <td className="py-3 text-right tabular-nums text-teal-700 dark:text-teal-400">{fmtTTD(result.totalTtd)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-3">
                  CIF {fmtUSD(result.cifUsd)} → {fmtTTD(result.cifTtd)} · FX {result.exchangeRate} ·
                  Duty {fmtTTD(result.dutyTtd)} · MVT {fmtTTD(result.mvtTtd)}{result.exciseTtd > 0 ? ` · Excise ${fmtTTD(result.exciseTtd)}` : ''} · VAT {fmtTTD(result.vatTtd)} ·
                  Fees {fmtTTD(result.feesTtd)} · Environmental {fmtTTD(result.environmentalTtd)}
                </p>
                {result.vehicleConcession && result.vehicleConcession.instruments.length > 0 && (
                  <div className="mt-3 rounded-md border border-teal-600/30 bg-teal-600/5 p-3">
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mb-1.5">Legal regime applied: {result.vehicleConcession.regime}</p>
                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      {result.vehicleConcession.instruments.map((ins, i) => <li key={i}>• {ins}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  Reference figures from versioned legal schedules (config editable). The broker of record remains
                  responsible for the customs declaration — CaribClear is a tool, not a licensed agent.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ k, label, v, set, type = 'number' }: { k: string; label: string; v: Record<string, string | boolean>; set: (k: string, v: string | boolean) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`f-${k}`} className="text-xs">{label}</Label>
      <Input id={`f-${k}`} type={type} className="h-9" value={String(v[k] ?? '')} onChange={e => set(k, e.target.value)} />
    </div>
  );
}
