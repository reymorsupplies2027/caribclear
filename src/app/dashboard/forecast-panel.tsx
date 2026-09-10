'use client';

/**
 * Demurrage forecast panel — real statistics over the tenant's own released
 * shipments (POST /api/shipments/forecast). Shows p50/p75/p90 clearance
 * predictions, demurrage exposure and concrete recommendations per active
 * shipment. When the tenant has no history yet it says so honestly.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtTTD } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ShieldAlert, Gauge, Lightbulb, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Forecast {
  sufficientHistory: boolean;
  sampleSize: number;
  segmentSampleSize: number;
  segmentLabel: string;
  predictedClearanceDays: { p50: number | null; p75: number | null; p90: number | null };
  daysElapsedSinceStart: number | null;
  freeDaysRemaining: number | null;
  expectedDemurrageTtd: number | null;
  worstCaseDemurrageTtd: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  recommendations: string[];
  note: string;
}
interface ForecastRow { shipmentId: string; reference: string; status: string; forecast: Forecast }
interface ForecastResponse { forecasts: ForecastRow[]; historySize: number }

const RISK_STYLES: Record<Forecast['riskLevel'], string> = {
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

export function ForecastPanel() {
  const [rows, setRows] = useState<ForecastRow[] | null>(null);
  const [historySize, setHistorySize] = useState(0);

  useEffect(() => {
    api<ForecastResponse>('/api/shipments/forecast', { method: 'POST', body: JSON.stringify({}) })
      .then(d => { setRows(d.forecasts); setHistorySize(d.historySize); })
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <Skeleton className="h-52" />;

  const withPrediction = rows.filter(r => r.forecast.sufficientHistory);
  const atRisk = rows.filter(r => r.forecast.riskLevel === 'high' || r.forecast.riskLevel === 'medium');
  const exposure = rows.reduce((acc, r) => acc + (r.forecast.expectedDemurrageTtd ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-teal-600" /> Demurrage forecast — your own history</CardTitle>
        <Badge variant="outline" className="gap-1"><History className="h-3 w-3" /> {historySize} released shipment(s)</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No active shipments to forecast. Create one and the engine starts learning from every release.
          </p>
        )}

        {rows.length > 0 && withPrediction.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center">
            <Gauge className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">The forecast activates with your first released shipments</p>
            <p className="text-xs text-muted-foreground mt-1">
              It uses the real clearance times of YOUR released cargo ({historySize} so far — minimum 1). No invented numbers.
            </p>
          </div>
        )}

        {atRisk.length > 0 && (
          <p className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
            <span><strong>{atRisk.length}</strong> shipment(s) at demurrage risk · expected exposure <strong>{fmtTTD(exposure)}</strong></span>
          </p>
        )}

        <div className="grid gap-2 lg:grid-cols-2">
          {rows.slice(0, 4).map(r => {
            const f = r.forecast;
            return (
              <Link key={r.shipmentId} href={`/dashboard/shipments/${r.shipmentId}`}
                className="rounded-lg border p-3 hover:bg-muted/50 transition-colors space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{r.reference}</span>
                  <Badge variant="outline" className={cn('text-[10px] border', RISK_STYLES[f.riskLevel])}>
                    {f.riskLevel === 'unknown' ? 'no data' : `risk ${f.riskLevel}`}
                  </Badge>
                </div>
                {f.sufficientHistory ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Metric label="typical" v={f.predictedClearanceDays.p50} unit="d" />
                      <Metric label="p75" v={f.predictedClearanceDays.p75} unit="d" />
                      <Metric label="worst" v={f.predictedClearanceDays.p90} unit="d" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.freeDaysRemaining !== null
                        ? `${f.freeDaysRemaining <= 0 ? 'FREE DAYS OVER' : `${f.freeDaysRemaining} free day(s) left`}`
                        : 'clock not started'}
                      {f.expectedDemurrageTtd != null && f.expectedDemurrageTtd > 0 && <> · exposure {fmtTTD(f.expectedDemurrageTtd)} (worst {fmtTTD(f.worstCaseDemurrageTtd ?? 0)})</>}
                    </p>
                    <p className="text-xs flex items-start gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{f.recommendations[0]}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{f.recommendations[1] ?? f.note}</p>
                )}
              </Link>
            );
          })}
        </div>
        {withPrediction.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Percentiles over {withPrediction[0].forecast.sampleSize} released shipment(s) — segment {withPrediction[0].forecast.segmentLabel}.
            Statistical estimate from your own data, not a guarantee.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, v, unit }: { label: string; v: number | null; unit: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{v != null ? `${Math.round(v)}${unit}` : '—'}</p>
    </div>
  );
}
