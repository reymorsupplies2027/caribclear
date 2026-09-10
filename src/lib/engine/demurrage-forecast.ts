/**
 * CaribClear — Demurrage / clearance forecast engine (pure, testable).
 *
 * Real frequentist statistics over the tenant's OWN shipment history — no
 * invented "AI", no external data dependencies:
 *
 *  - History rows are (segment features, clearance days) pairs built by the
 *    route from released shipments: clearanceDays = releasedAt −
 *    demurrageStartDate (both exist once customs releases cargo).
 *  - Segments: mode (sea/air) + lane (origin→destination port) + container
 *    bucket (0 / 1 / 2+). Small segments shrink toward their parent sample
 *    (Bayesian-style shrinkage with weight n/(n+k)), so a tenant with 3
 *    shipments still gets an honest estimate instead of a wild one.
 *  - Output: p50/p75/p90 predicted clearance days, demurrage exposure in TTD
 *    against the shipment's free days and per-day penalty, and concrete
 *    recommendations (docs before arrival, exam booking, permit chase).
 *
 * When history is insufficient the engine says so — it never fabricates a
 * number (returns null predictions + guidance).
 */

export interface HistoryRow {
  clearanceDays: number;
  mode: string;                       // sea | air
  lane: string | null;                // "originPort→destinationPort"
  containerCount: number;
}

export interface ShipmentUnderForecast {
  mode: string;
  lane: string | null;
  containerCount: number;
  freeDays: number;
  perDayTtd: number;
  demurrageStartIso: string | null;
  status: string;
  hasPermitPending: boolean;
}

export interface ForecastResult {
  sufficientHistory: boolean;
  sampleSize: number;
  segmentSampleSize: number;
  segmentLabel: string;
  predictedClearanceDays: { p50: number | null; p75: number | null; p90: number | null };
  daysElapsedSinceStart: number | null;
  freeDaysRemaining: number | null;
  expectedDemurrageTtd: number | null;   // expected (p50) scenario
  worstCaseDemurrageTtd: number | null;  // p90 scenario
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  recommendations: string[];
  note: string;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** Container bucket: 0 = LCL/breakbulk, 1 = single container, 2 = 2+ FCL. */
export function containerBucket(count: number): 0 | 1 | 2 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  return 2;
}

interface SegmentStats { n: number; p50: number; p75: number; p90: number }

function statsFor(rows: HistoryRow[]): SegmentStats | null {
  if (rows.length === 0) return null;
  const days = rows.map(r => r.clearanceDays).sort((a, b) => a - b);
  return { n: days.length, p50: quantile(days, 0.5), p75: quantile(days, 0.75), p90: quantile(days, 0.9) };
}

function blend(child: SegmentStats | null, parent: SegmentStats | null, k: number): SegmentStats | null {
  if (!child && !parent) return null;
  if (!parent) return child;
  if (!child) return parent;
  // Shrinkage: w = n/(n+k) — child dominates as its real observations accumulate
  const w = child.n / (child.n + k);
  const mix = (a: number, b: number) => a * w + b * (1 - w);
  return {
    n: child.n,
    p50: mix(child.p50, parent.p50),
    p75: mix(child.p75, parent.p75),
    p90: mix(child.p90, parent.p90),
  };
}

const DIRECT_SAMPLE_MIN = 5; // a segment with ≥5 real observations speaks for itself

/**
 * Hierarchical segment selection with honest shrinkage:
 *   level 3 = mode+lane+bucket → level 2 = mode+lane → level 1 = mode → global.
 * The finest level with ≥ DIRECT_SAMPLE_MIN observations is used as-is; below
 * that, the estimate shrinks toward the parent level (k=3 pseudo-observations),
 * so a single outlier never invents a forecast.
 */
function selectSegment(
  sFull: SegmentStats | null,
  sLane: SegmentStats | null,
  sMode: SegmentStats | null,
  overall: SegmentStats | null,
): { stats: SegmentStats; level: string } | null {
  if (sFull && sFull.n >= DIRECT_SAMPLE_MIN) return { stats: sFull, level: 'mode+lane+contenedores' };
  const l2 = blend(sFull, sLane, 3);
  if (sLane && sLane.n >= DIRECT_SAMPLE_MIN) return { stats: l2 ?? sLane, level: 'mode+lane' };
  const l1 = blend(l2, sMode, 3);
  if (sMode && sMode.n >= DIRECT_SAMPLE_MIN) return { stats: l1 ?? sMode, level: 'mode' };
  const l0 = blend(l1, overall, 3);
  if (overall && overall.n > 0) return { stats: l0 ?? overall, level: 'global' };
  return null;
}

export function forecastDemurrage(history: HistoryRow[], target: ShipmentUnderForecast, now = new Date()): ForecastResult {
  const recs: string[] = [];
  const overall = statsFor(history);
  const bucket = containerBucket(target.containerCount);

  // Segment 1: mode → Segment 2: mode+lane → Segment 3: mode+lane+container bucket
  const modeRows = history.filter(r => r.mode === target.mode);
  const laneRows = target.lane ? modeRows.filter(r => r.lane === target.lane) : [];
  const fullRows = laneRows.filter(r => containerBucket(r.containerCount) === bucket);

  const sMode = statsFor(modeRows);
  const sLane = statsFor(laneRows);
  const sFull = statsFor(fullRows);

  const picked = selectSegment(sFull, sLane, sMode, overall);

  const segmentLabel = [
    target.mode,
    target.lane ?? 'lane sin datos',
    bucket === 0 ? 'LCL/bulk' : bucket === 1 ? '1 contenedor' : `${target.containerCount} contenedores`,
  ].join(' · ');

  if (!picked || picked.stats.n === 0) {
    return {
      sufficientHistory: false,
      sampleSize: history.length,
      segmentSampleSize: 0,
      segmentLabel,
      predictedClearanceDays: { p50: null, p75: null, p90: null },
      daysElapsedSinceStart: null,
      freeDaysRemaining: null,
      expectedDemurrageTtd: null,
      worstCaseDemurrageTtd: null,
      riskLevel: 'unknown',
      recommendations: [
        'Sin historial suficiente (se necesitan embarques liberados con fechas de inicio y fin de aduana).',
        'Aun así: presente el C73 y documentos ANTES de la llegada — el pico de demora es el trámite inicial.',
        target.hasPermitPending ? 'Este embarque tiene permisos pendientes: son la causa #1 de estadía extendida.' : 'Confirme permisos/regulaciones desde ahora (matriz T&T).',
      ],
      note: `El sistema necesita al menos 1 embarque liberado; hay ${history.length} en el historial. La predicción se activa sola con los primeros cierres.`,
    };
  }

  const p50 = Math.round(picked.stats.p50 * 10) / 10;
  const p75 = Math.round(picked.stats.p75 * 10) / 10;
  const p90 = Math.round(picked.stats.p90 * 10) / 10;

  let daysElapsed: number | null = null;
  if (target.demurrageStartIso) {
    daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(target.demurrageStartIso).getTime()) / 86400000));
  }
  const freeDaysRemaining = daysElapsed === null ? null : target.freeDays - daysElapsed;

  const chargeable = (totalDays: number): number => {
    const over = Math.ceil(totalDays) - target.freeDays;
    return over > 0 ? over * target.perDayTtd : 0;
  };
  const expectedDemurrageTtd = Math.round(chargeable(p50));
  const worstCaseDemurrageTtd = Math.round(chargeable(p90));

  // Risk: compares elapsed + predicted vs free window
  let riskLevel: ForecastResult['riskLevel'] = 'low';
  if (freeDaysRemaining !== null) {
    if (freeDaysRemaining <= 0) riskLevel = 'high';
    else if (p75 > target.freeDays || freeDaysRemaining <= 2) riskLevel = 'high';
    else if (p90 > target.freeDays || freeDaysRemaining <= 4) riskLevel = 'medium';
  } else if (p75 > target.freeDays) riskLevel = 'medium';

  // Recommendations — deterministic rules over real facts
  if (target.status === 'order_placed' || target.status === 'sailed' || target.status === 'in_transit') {
    recs.push(`Embarque aún en ruta: prepare y presente la declaración (C73) antes de la llegada — históricamente este trámite consume la mayor parte de los ${Math.round(p50)} días típicos.`);
  }
  if (target.hasPermitPending) {
    recs.push('Permisos pendientes: este segmento históricamente se estanca por regulaciones — persiga la aprobación HOY (CFO/TTBS/EMA según partida).');
  }
  if (freeDaysRemaining !== null && freeDaysRemaining <= 3 && freeDaysRemaining > 0) {
    recs.push(`Quedan ${freeDaysRemaining} días libres: programe el examen y el pago de impuestos ahora para retirar antes del día ${target.freeDays}.`);
  }
  if (freeDaysRemaining !== null && freeDaysRemaining <= 0) {
    recs.push(`Días libres agotados: cada día adicional cuesta TT$${target.perDayTtd.toLocaleString('en-TT')} — priorice el retiro de este contenedor sobre embarques nuevos.`);
  }
  if (p90 - p50 >= 4) {
    recs.push(`Alta variabilidad en esta ruta (p90 = ${Math.round(p90)} días vs mediana ${Math.round(p50)}): presupueste colchón de ${Math.round(p90 - p50)} días extra en sus cotizaciones.`);
  }
  if (recs.length === 0) {
    recs.push(`Ritmo típico del segmento: liberación en ~${Math.round(p50)} días (p75 ${Math.round(p75)}). Con ${target.freeDays} días libres el margen es suficiente — mantenga los documentos al día.`);
  }

  return {
    sufficientHistory: true,
    sampleSize: history.length,
    segmentSampleSize: picked.stats.n,
    segmentLabel: `${segmentLabel} [nivel: ${picked.level}]`,
    predictedClearanceDays: { p50, p75, p90 },
    daysElapsedSinceStart: daysElapsed,
    freeDaysRemaining,
    expectedDemurrageTtd,
    worstCaseDemurrageTtd,
    riskLevel,
    recommendations: recs,
    note: `Estadística sobre ${history.length} embarque(s) liberados del propio tenant (segmento: ${segmentLabel}, n=${picked.stats.n}). No es una garantía.`,
  };
}
