'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Wrench, Boxes, Ruler, DollarSign, CalendarClock, Calculator, TrendingUp } from 'lucide-react';
/**
 * Operator tools — the daily math a clearing clerk actually runs between
 * entries, all client-side and instant (works offline once the PWA is cached):
 *  - CBM & volumetric weight (container / LCL planning)
 *  - Unit converter (kg↔lb, L↔gal, m↔ft, m²↔ft²)
 *  - FX converter (USD↔TTD)
 *  - Demurrage day counter (arrival → free days → chargeable days)
 * Deep calculations stay in the Cost engine and the demurrage forecaster.
 */

const LB_PER_KG = 2.20462262185;
const L_PER_USGAL = 3.785411784;
const FT_PER_M = 3.28083989501;
const SQFT_PER_SQM = 10.76391041671;

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 space-y-5">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-teal-600" /> Operator tools</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The everyday math between entries — instant and offline-capable. For official duty figures, use the <Link href="/dashboard/calculator" className="text-teal-700 dark:text-teal-400 hover:underline">Cost engine</Link>.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <CbmCard />
        <ConverterCard />
        <FxCard />
        <DemurrageDaysCard />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal-600" /> Deep tools</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
          <Link href="/dashboard/calculator" className="rounded-lg border p-3 hover:bg-muted/60 transition-colors">
            <span className="font-medium flex items-center gap-1.5"><Calculator className="h-4 w-4 text-teal-600" /> Cost engine</span>
            <span className="text-xs text-muted-foreground">Official T&T landed cost, line by line, with the versioned legal rates.</span>
          </Link>
          <Link href="/dashboard/shipments" className="rounded-lg border p-3 hover:bg-muted/60 transition-colors">
            <span className="font-medium">Demurrage forecast</span>
            <span className="text-xs text-muted-foreground block">AI prediction of storage/demurrage exposure per shipment (forecast panel).</span>
          </Link>
          <Link href="/dashboard/forms" className="rounded-lg border p-3 hover:bg-muted/60 transition-colors">
            <span className="font-medium">Forms studio</span>
            <span className="text-xs text-muted-foreground block">C82 · C73 · C83 · C84 · C86 · CARICOM CO — built from your real data.</span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function CbmCard() {
  const [pkgs, setPkgs] = useState('10');
  const [l, setL] = useState('120'), [w, setW] = useState('80'), [h, setH] = useState('90');
  const [kgEach, setKgEach] = useState('45');

  const r = useMemo(() => {
    const n = Math.max(0, Number(pkgs) || 0);
    const perPallet = (Number(l) || 0) * (Number(w) || 0) * (Number(h) || 0) / 1_000_000; // cm → m³
    const totalCbm = n * perPallet;
    const totalKg = n * (Number(kgEach) || 0);
    // IATA volumetric weight air: L×W×H cm / 6000; sea LCL charges per m³ (1 m³ ≈ 1000 kg floor)
    const airVolKg = (Number(l) || 0) * (Number(w) || 0) * (Number(h) || 0) / 6000 * n;
    const seaChargeableKg = Math.max(totalKg, totalCbm * 1000);
    return { perPallet, totalCbm, totalKg, airVolKg, seaChargeableKg };
  }, [pkgs, l, w, h, kgEach]);

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4 text-teal-600" /> CBM & volumetric weight</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <NumField label="Packages" v={pkgs} s={setPkgs} />
          <NumField label="L (cm)" v={l} s={setL} /><NumField label="W (cm)" v={w} s={setW} /><NumField label="H (cm)" v={h} s={setH} />
          <NumField label="kg each" v={kgEach} s={setKgEach} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Res label="CBM per package" v={r.perPallet.toFixed(3)} />
          <Res label="Total CBM" v={r.totalCbm.toFixed(2)} strong />
          <Res label="Total gross kg" v={r.totalKg.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
          <Res label="Air volumetric kg (÷6000)" v={r.airVolKg.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
          <Res label="Sea LCL chargeable kg" v={r.seaChargeableKg.toLocaleString('en-US', { maximumFractionDigits: 0 })} hint="max(gross, CBM×1000)" />
        </div>
        <p className="text-[11px] text-muted-foreground">Compare air volumetric vs gross to see which one the airline charges; sea LCL floors at 1000 kg per m³.</p>
      </CardContent>
    </Card>
  );
}

function ConverterCard() {
  const [kg, setKg] = useState('100'), [lb, setLb] = useState('220.46');
  const [l, setL] = useState('100'), [gal, setGal] = useState('26.42');
  const [m, setM] = useState('10'), [ft, setFt] = useState('32.81');
  const [sqm, setSqm] = useState('10'), [sqft, setSqft] = useState('107.64');
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Ruler className="h-4 w-4 text-teal-600" /> Unit converter</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Pair a="kg" aVal={kg} aSet={(v) => { setKg(v); setLb(String(Math.round((Number(v) || 0) * LB_PER_KG * 100) / 100)); }}
          b="lb" bVal={lb} bSet={(v) => { setLb(v); setKg(String(Math.round(((Number(v) || 0) / LB_PER_KG) * 100) / 100)); }} />
        <Pair a="L" aVal={l} aSet={(v) => { setL(v); setGal(String(Math.round(((Number(v) || 0) / L_PER_USGAL) * 100) / 100)); }}
          b="US gal" bVal={gal} bSet={(v) => { setGal(v); setL(String(Math.round((Number(v) || 0) * L_PER_USGAL * 100) / 100)); }} />
        <Pair a="m" aVal={m} aSet={(v) => { setM(v); setFt(String(Math.round((Number(v) || 0) * FT_PER_M * 100) / 100)); }}
          b="ft" bVal={ft} bSet={(v) => { setFt(v); setM(String(Math.round(((Number(v) || 0) / FT_PER_M) * 100) / 100)); }} />
        <Pair a="m²" aVal={sqm} aSet={(v) => { setSqm(v); setSqft(String(Math.round((Number(v) || 0) * SQFT_PER_SQM * 100) / 100)); }}
          b="ft²" bVal={sqft} bSet={(v) => { setSqft(v); setSqm(String(Math.round(((Number(v) || 0) / SQFT_PER_SQM) * 100) / 100)); }} />
      </CardContent>
    </Card>
  );
}

function Pair({ a, aVal, aSet, b, bVal, bSet }: {
  a: string; aVal: string; aSet: (v: string) => void;
  b: string; bVal: string; bSet: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <label className="block flex-1">
        <span className="text-[11px] font-medium text-muted-foreground">{a}</span>
        <Input type="number" step="any" className="mt-0.5 h-8 text-sm" value={aVal} onChange={(e) => aSet(e.target.value)} />
      </label>
      <span className="pb-2 text-muted-foreground">⇄</span>
      <label className="block flex-1">
        <span className="text-[11px] font-medium text-muted-foreground">{b}</span>
        <Input type="number" step="any" className="mt-0.5 h-8 text-sm" value={bVal} onChange={(e) => bSet(e.target.value)} />
      </label>
    </div>
  );
}

function FxCard() {
  const [rate, setRate] = useState('6.80');
  const [usd, setUsd] = useState('1000');
  const [ttd, setTtd] = useState('6800');
  const r = Number(rate) || 0;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-teal-600" /> FX converter (USD ⇄ TTD)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <NumField label="TT$ per US$1" v={rate} s={(v) => { setRate(v); const n = Number(v) || 0; if (n > 0 && Number(usd)) setTtd(String(Math.round(Number(usd) * n * 100) / 100)); }} step="0.01" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">USD</span>
            <Input type="number" step="0.01" className="mt-0.5 h-8 text-sm" value={usd}
              onChange={(e) => { setUsd(e.target.value); if (r > 0) setTtd(String(Math.round((Number(e.target.value) || 0) * r * 100) / 100)); }} />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">TTD</span>
            <Input type="number" step="0.01" className="mt-0.5 h-8 text-sm" value={ttd}
              onChange={(e) => { setTtd(e.target.value); if (r > 0) setUsd(String(Math.round(((Number(e.target.value) || 0) / r) * 100) / 100)); }} />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Type in either box — the other updates at the rate above. Set your tenant default in Settings → Company; the Cost engine uses it automatically.</p>
      </CardContent>
    </Card>
  );
}

function DemurrageDaysCard() {
  const [arrival, setArrival] = useState('');
  const [free, setFree] = useState('5');
  const [perDay, setPerDay] = useState('250');
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  const r = useMemo(() => {
    if (!arrival) return null;
    const a = new Date(arrival + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const elapsed = Math.max(0, Math.round((t.getTime() - a.getTime()) / 86_400_000));
    const freeDays = Math.max(0, Number(free) || 0);
    const chargeable = Math.max(0, elapsed - freeDays);
    const cost = chargeable * (Number(perDay) || 0);
    return { elapsed, chargeable, cost, stillFree: elapsed <= freeDays };
  }, [arrival, free, perDay, today]);

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-teal-600" /> Demurrage / storage day counter</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block"><span className="text-[11px] text-muted-foreground">Arrival date</span>
            <Input type="date" className="mt-0.5 h-8" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
          <NumField label="Free days" v={free} s={setFree} />
          <NumField label="TT$/day" v={perDay} s={setPerDay} />
          <label className="block"><span className="text-[11px] text-muted-foreground">Count to</span>
            <Input type="date" className="mt-0.5 h-8" value={today} onChange={(e) => setToday(e.target.value)} /></label>
        </div>
        {r ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Res label="Days since arrival" v={String(r.elapsed)} />
            <Res label="Chargeable days" v={String(r.chargeable)} />
            <Res label={r.stillFree ? 'Within free time' : 'Exposure so far'} v={r.stillFree ? 'TT$ 0' : `TT$ ${r.cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} strong={!r.stillFree} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Pick the arrival date (manifest/berth date) to start counting.</p>
        )}
        <p className="text-[11px] text-muted-foreground">Quick counter for the yard wall — the AI forecast panel gives per-shipment predictions with the real tariff curves.</p>
      </CardContent>
    </Card>
  );
}

function NumField({ label, v, s, step }: { label: string; v: string; s: (v: string) => void; step?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input type="number" step={step ?? 'any'} className="mt-0.5 h-8 text-sm" value={v} onChange={(e) => s(e.target.value)} />
    </label>
  );
}

function Res({ label, v, strong, hint }: { label: string; v: string; strong?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={strong ? 'text-base font-bold text-teal-700 dark:text-teal-400' : 'text-sm font-semibold'}>{v}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
