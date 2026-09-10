/**
 * CaribClear — AI-support engine tests: HS lexical classifier + demurrage forecast.
 * Run: bun tests/ai-engines.test.ts
 * All scenarios use REAL T&T tariff rows and realistic clearance histories.
 */
import { classifyLexical, lexicalScore, type TariffRow } from '../src/lib/engine/hs-classify';
import {
  forecastDemurrage, containerBucket,
  type HistoryRow, type ShipmentUnderForecast,
} from '../src/lib/engine/demurrage-forecast';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

// Real subset of the T&T tariff table (mirrors HS_SEED)
const TABLE: TariffRow[] = [
  { code: '0106', description: 'Live animals — other', chapter: '01', cetRate: 0, vatExempt: true, notes: 'CFO permit casi siempre requerido' },
  { code: '0302', description: 'Fish, fresh or chilled', chapter: '03', cetRate: 15, notes: 'CFO import permit' },
  { code: '0406', description: 'Cheese and curd', chapter: '04', cetRate: 20, notes: 'CFO permit; CARICOM preferential rates' },
  { code: '1006', description: 'Rice', chapter: '10', cetRate: 25, notes: 'CET CARICOM rice band' },
  { code: '1701', description: 'Cane/beet sugar', chapter: '17', cetRate: 40, notes: 'CARICOM sensitive item' },
  { code: '2203', description: 'Beer made from malt', chapter: '22', cetRate: 50, notes: 'excise applies' },
  { code: '2523', description: 'Portland cement', chapter: '25', cetRate: 10, notes: 'TTBS standards apply' },
  { code: '3004', description: 'Medicaments (dosed)', chapter: '30', cetRate: 0, vatExempt: true, notes: 'Chemicals Division notification' },
  { code: '4011', description: 'New pneumatic tyres', chapter: '40', cetRate: 20, notes: 'Tyre tax TT$40/tyre' },
  { code: '8471', description: 'Computers, laptops', chapter: '84', cetRate: 0, vatExempt: true, notes: 'ITA duty free' },
  { code: '8507', description: 'Electric accumulators (batteries)', chapter: '85', cetRate: 10 },
  { code: '8517', description: 'Phones, smartphones', chapter: '85', cetRate: 0, vatExempt: true },
  { code: '8528', description: 'Televisions, monitors', chapter: '85', cetRate: 20, notes: 'TTBS conformity' },
  { code: '8703', description: 'Motor cars (petrol/diesel/EV) — cc brackets', chapter: '87', cetRate: 25, notes: 'MVT por cilindrada' },
  { code: '8708', description: 'Motor vehicle parts & accessories', chapter: '87', cetRate: 30, notes: 'T&T deviation' },
  { code: '9018', description: 'Medical devices, instruments', chapter: '90', cetRate: 0, vatExempt: true },
];

console.log('\n── A. Clasificador HS léxico ──');
{
  const r = classifyLexical('smartphone samsung galaxy 128gb', TABLE, 5);
  ok(r.candidates.length > 0 && r.candidates[0].code === '8517', `smartphone → 8517 (obtuvo ${r.candidates[0]?.code ?? 'nada'})`);
  ok(r.candidates[0].vatExempt === true, '8517 marcado VAT exento');
  ok(r.engine === 'lexical', 'engine lexical en etapa 1');
}
{
  const r = classifyLexical('laptop computer for office', TABLE, 5);
  ok(r.candidates[0]?.code === '8471', `laptop → 8471 (obtuvo ${r.candidates[0]?.code ?? 'nada'})`);
}
{
  const r = classifyLexical('portland cement bags 50kg construction', TABLE, 5);
  ok(r.candidates[0]?.code === '2523', `cemento → 2523 (obtuvo ${r.candidates[0]?.code ?? 'nada'})`);
}
{
  const r = classifyLexical('tyres for truck 22.5 inch', TABLE, 5);
  ok(r.candidates[0]?.code === '4011', `tyres → 4011 (obtuvo ${r.candidates[0]?.code ?? 'nada'})`);
}
{
  // Cross-language reality: lexical stage matches same-language tokens only.
  // "queso" ≠ "cheese" lexically → 0 candidates; the ROUTE then falls back to
  // showing the capped full table to the LLM (glm-4.6 resolves queso→0406).
  const r = classifyLexical('queso cheddar madurado', TABLE, 5);
  ok(r.candidates.length === 0, 'español sin cognados → 0 candidatos léxicos (la ruta activa el fallback LLM de tabla completa)');
}
{
  const r = classifyLexical('zzz qqq xyzzy', TABLE, 5);
  ok(r.candidates.length === 0, 'descripción sin match → cero candidatos (nunca inventa)');
}
{
  const r = classifyLexical('car parts: shock absorbers and radiators', TABLE, 5);
  ok(r.candidates.length > 0, 'plural fold (cars→car) rescata la búsqueda de partes');
  ok(r.candidates.slice(0, 3).some(c => c.code === '8708' || c.code === '8703'),
    `auto parts → 87xx en top 3 (obtuvo ${r.candidates.slice(0, 3).map(c => c.code).join(',')})`);
}
{
  // Ranking never leaves the table
  const r = classifyLexical('fresh fish snapper', TABLE, 5);
  ok(r.candidates.every(c => TABLE.some(t => t.code === c.code)), 'todos los candidatos pertenecen a la tabla real');
  const s1 = lexicalScore(['fresh', 'fish', 'snapper'], new Set(['fresh fish']), TABLE[1]);
  const s2 = lexicalScore(['fresh', 'fish', 'snapper'], new Set(['fresh fish']), TABLE[9]);
  ok(s1 > s2, `puntúa mejor pescado (${s1}) que computadoras (${s2})`);
}

console.log('── B. Forecast de demurrage ──');
const HISTORY: HistoryRow[] = [];
// Segmento sea PEX→POS 1 contenedor: 6-12 días (10 observaciones)
for (const d of [6, 7, 7, 8, 8, 8, 9, 10, 11, 12]) HISTORY.push({ clearanceDays: d, mode: 'sea', lane: 'PEX→POS', containerCount: 1 });
// Segmento sea otros lanes: 3-5 días (6 obs)
for (const d of [3, 4, 4, 4, 5, 5]) HISTORY.push({ clearanceDays: d, mode: 'sea', lane: 'MIA→POS', containerCount: 1 });
// Segmento air: 1-2 días (5 obs)
for (const d of [1, 1, 2, 2, 2]) HISTORY.push({ clearanceDays: d, mode: 'air', lane: 'MIA→POS', containerCount: 0 });

const TARGET_SEA_PEX: ShipmentUnderForecast = {
  mode: 'sea', lane: 'PEX→POS', containerCount: 1,
  freeDays: 5, perDayTtd: 350, demurrageStartIso: null, status: 'sailed', hasPermitPending: false,
};
{
  ok(containerBucket(0) === 0 && containerBucket(1) === 1 && containerBucket(3) === 2, 'buckets de contenedores 0/1/2+');
  const f = forecastDemurrage(HISTORY, TARGET_SEA_PEX, new Date('2026-09-10T12:00:00Z'));
  ok(f.sufficientHistory, 'historial suficiente');
  ok(f.sampleSize === 21, `usa las 21 observaciones (obtuvo ${f.sampleSize})`);
  ok(f.predictedClearanceDays.p50 !== null && f.predictedClearanceDays.p50 >= 7 && f.predictedClearanceDays.p50 <= 9,
    `p50 ancla al segmento PEX→POS (~8): ${f.predictedClearanceDays.p50}`);
  ok(f.predictedClearanceDays.p90 !== null && f.predictedClearanceDays.p90 >= f.predictedClearanceDays.p50!,
    `p90 ≥ p50 (${f.predictedClearanceDays.p90} ≥ ${f.predictedClearanceDays.p50})`);
  ok(f.expectedDemurrageTtd !== null && f.expectedDemurrageTtd > 0,
    `demurrage esperado > 0 porque mediana (~8d) > 5 días libres: TT$${f.expectedDemurrageTtd}`);
  ok(f.worstCaseDemurrageTtd! >= f.expectedDemurrageTtd!, 'peor caso ≥ esperado');
  ok(f.riskLevel === 'medium' || f.riskLevel === 'high', `riesgo elevado (${f.riskLevel})`);
  ok(f.recommendations.some(r => r.toLowerCase().includes('c73') || r.toLowerCase().includes('declaración')), 'recomendación de C73 pre-llegada');
}
{
  const targetAir: ShipmentUnderForecast = { ...TARGET_SEA_PEX, mode: 'air', lane: 'MIA→POS', containerCount: 0 };
  const f = forecastDemurrage(HISTORY, targetAir, new Date('2026-09-10T12:00:00Z'));
  ok(f.predictedClearanceDays.p50! < 3, `air p50 rápido (~2): ${f.predictedClearanceDays.p50}`);
  ok(f.expectedDemurrageTtd === 0, 'sin demurrage esperado: 2 días < 5 libres');
  ok(f.riskLevel === 'low', `riesgo bajo (${f.riskLevel})`);
}
{
  // Demurrage ya corriendo: start 10 días atrás, free 5 → high risk + recommendation
  const start = new Date(Date.now() - 10 * 86400000).toISOString();
  const target: ShipmentUnderForecast = { ...TARGET_SEA_PEX, demurrageStartIso: start, status: 'in_customs', hasPermitPending: true };
  const f = forecastDemurrage(HISTORY, target);
  ok(f.daysElapsedSinceStart === 10, `días transcurridos = 10 (obtuvo ${f.daysElapsedSinceStart})`);
  ok(f.freeDaysRemaining === -5, `días libres restantes = -5 (obtuvo ${f.freeDaysRemaining})`);
  ok(f.riskLevel === 'high', 'riesgo high con días libres agotados');
  ok(f.recommendations.some(r => r.includes('350')), 'recomendación menciona el costo TT$350/día real');
  ok(f.recommendations.some(r => r.toLowerCase().includes('permiso')), 'recomendación por permiso pendiente');
}
{
  // Historial insuficiente → honesto, sin números inventados
  const f = forecastDemurrage([], TARGET_SEA_PEX);
  ok(!f.sufficientHistory, 'sin historial → sufficientHistory=false');
  ok(f.predictedClearanceDays.p50 === null && f.expectedDemurrageTtd === null, 'predicciones null (no fabricadas)');
  ok(f.note.includes('0'), 'nota explica cuántos embarques hacen falta');
  ok(f.recommendations.length >= 2, 'entrega guía operativa aunque no prediga');
}
{
  // Shrinkage: segmento pequeño (1 obs de 30d) se encoge hacia el padre
  const tiny: HistoryRow[] = [...HISTORY, { clearanceDays: 30, mode: 'sea', lane: 'SHA→POS', containerCount: 2 }];
  const target: ShipmentUnderForecast = { ...TARGET_SEA_PEX, lane: 'SHA→POS', containerCount: 2 };
  const f = forecastDemurrage(tiny, target);
  ok(f.predictedClearanceDays.p50! < 25 && f.predictedClearanceDays.p50! > 8,
    `n=1 con 30d se encoge hacia el global (p50=${f.predictedClearanceDays.p50}, entre 8 y 25)`);
  ok(f.segmentSampleSize >= 1, 'reporta el tamaño real del segmento');
}
{
  // Embarque liberado NO entra a objetivos activos (lo filtra la ruta); engine acepta cualquier status
  const target: ShipmentUnderForecast = { ...TARGET_SEA_PEX, status: 'released', demurrageStartIso: new Date(Date.now() - 9 * 86400000).toISOString() };
  const f = forecastDemurrage(HISTORY, target);
  ok(f.daysElapsedSinceStart === 9, 'engine calcula elapsed también para liberados (la ruta decide a quién pronosticar)');
}

console.log(`\n════════════════════════════════`);
console.log(`RESULTADO: ${passed} pasaron, ${failed} fallaron`);
console.log(`════════════════════════════════\n`);
if (failed > 0) process.exit(1);
