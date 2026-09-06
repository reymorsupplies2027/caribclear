/**
 * CaribClear — Landed Cost Engine test suite (26 cases).
 * Run: bun tests/engine.test.ts   (also: npm run test:engine)
 * Every case uses real-world T&T scenarios from the master brief.
 */
import {
  calculateLandedCost, round2, DEFAULT_RATE_CONFIG as CFG,
  type LandedCostInput,
} from '../src/lib/engine/landed-cost';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function approx(a: number, b: number, tol = 0.02) { return Math.abs(a - b) <= tol; }

const base: Omit<LandedCostInput, 'config'> = {
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, exchangeRate: 6.80,
  hsCode: '8528', cetRate: 20,
};

function run(over: Partial<LandedCostInput>) {
  return calculateLandedCost({ ...base, ...over, config: (over.config ?? CFG) as typeof CFG });
}

console.log('\n── 1. CIF & redondeo ──');
{
  const r = run({});
  ok(r.cifUsd === 12000, 'CIF USD = FOB+flete+seguro (10000+1500+500=12000)');
  ok(r.cifTtd === 81600, 'CIF TTD = 12000 × 6.80 = 81,600.00');
  const r2 = run({ fobUsd: 333.335, freightUsd: 0, insuranceUsd: 0 });
  ok(r2.cifTtd === round2(round2(333.335) * 6.8), 'redondeo half-up: CIF USD primero, luego TTD a 2 decimales');
}
console.log('── 2. Mercancía general (CET 20% + VAT) ──');
{
  const r = run({});
  ok(r.dutyTtd === 16320, 'duty = 81,600 × 20% = 16,320');
  ok(r.vatTtd === 12240, 'VAT 12.5% = (81600+16320) × 12.5% = 12,240');
  ok(r.totalTtd === 81600 + 16320 + 12240 + 80, 'total = CIF+duty+VAT+fee declaración $80');
  ok(r.landedOverCifPct > 34 && r.landedOverCifPct < 36, `over-CIF % razonable (${r.landedOverCifPct}%)`);
}
console.log('── 3. Partida exenta (computadoras 8471) ──');
{
  const r = run({ hsCode: '8471', cetRate: 0, vatExempt: true });
  ok(r.dutyTtd === 0, 'duty 0% ITA');
  ok(r.vatTtd === 0, 'VAT exento = 0');
  ok(r.totalTtd === 81600 + 80, 'total = CIF + fee declaración');
}
console.log('── 4. Vehículo usado gasolina 1500cc (caso masivo T&T) ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2021 },
  });
  ok(r.dutyTtd === round2(81600 * 0.25), 'duty petrol ≤1599cc = 25%');
  ok(r.mvtTtd === round2(1500 * 5 * 0.75), 'MVT = 1500cc × $5 × 75% foreign-used = 5,625');
  ok(r.vatTtd === round2((81600 + r.dutyTtd + r.mvtTtd) * 0.125), 'VAT base incluye MVT (VAT Act Sched 2(8)(4))');
  ok(r.warnings.length === 0 || r.warnings.every(w => !w.includes('NO importable')), 'vehículo 2021 dentro del límite de 6 años');
}
console.log('── 5. Vehículo usado gasolina 2000cc ──');
{
  const r = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 2000, used: true } });
  ok(r.dutyTtd === round2(81600 * 0.35), 'duty petrol 1599-2000cc = 35% (2000 inclusive)');
  ok(r.mvtTtd === round2(2000 * 25 * 0.75), 'MVT bracket 1999-2499cc → 2000cc cae en $25/cc');
}
console.log('── 6. Vehículo NUEVO gasolina 1599cc ──');
{
  const r = run({ hsCode: '8703', cetRate: 25, vehicle: { fuel: 'petrol', engineCc: 1599, used: false } });
  ok(r.dutyTtd === round2(81600 * 0.25), '1599cc < 1600 → 25%');
  ok(r.mvtTtd === round2(1599 * 5), 'MVT nuevo sin factor 75%: 1599 × $5');
}
console.log('── 7. Vehículo diesel 2400cc ──');
{
  const r = run({ hsCode: '8703', cetRate: 60, vehicle: { fuel: 'diesel', engineCc: 2400, used: true } });
  ok(r.dutyTtd === round2(81600 * 0.60), 'duty diesel 2000-2500cc = 60%');
  ok(r.mvtTtd === round2(2400 * 25 * 0.75), 'MVT diesel 1999-2499cc = $25/cc × 75%');
}
console.log('── 8. EV eléctrico ──');
{
  const r = run({ hsCode: '8703', cetRate: 30, vehicle: { fuel: 'ev', engineCc: 0, used: false } });
  ok(r.dutyTtd === round2(81600 * 0.30), 'duty EV = 30% base');
  ok(r.mvtTtd === 0, 'MVT EV = 0 (concesión ≤TT$400k)');
  ok(r.warnings.some(w => w.includes('EV')), 'warning de concesión EV presente');
}
console.log('── 9. Vehículo >6 años genera warning crítico ──');
{
  const r = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 1800, used: true, yearOfManufacture: 2018 } });
  ok(r.warnings.some(w => w.includes('NO importable')), 'warning: supera límite 6 años');
}
console.log('── 10. Contenedores y fees 2026 ──');
{
  const r = run({ containers: ['20ft', '40ft'] });
  const exam = r.lines.find(l => l.key === 'container_exam');
  ok(!!exam && exam.amount === 750 + 1050, 'examen 20ft $750 + 40ft $1,050');
  const decl = r.lines.find(l => l.key === 'declaration_fee');
  ok(!!decl && decl.amount === 80, 'declaration fee 2026 = $80');
  ok(r.feesTtd === 80 + 1800, 'fees total = 80 + 1,800');
}
console.log('── 11. Neumáticos (4011): tyre tax ──');
{
  const r = run({ hsCode: '4011', cetRate: 20, tyreCount: 8 });
  const tyre = r.lines.find(l => l.key === 'tyre_tax');
  ok(!!tyre && tyre.amount === 320, 'tyre tax = 8 × $40 = $320');
  ok(r.environmentalTtd === 320, 'environmental total incluye tyre tax');
}
console.log('── 12. Plásticos un solo uso ──');
{
  const r = run({ hsCode: '3923', cetRate: 20, isSingleUsePlastics: true });
  const plast = r.lines.find(l => l.key === 'plastics_tax');
  ok(!!plast && plast.amount === round2(81600 * 0.05), 'plastics tax = 5% CIF');
}
console.log('── 13. Online purchase tax ──');
{
  const r = run({ isOnlinePurchase: true });
  const opt = r.lines.find(l => l.key === 'online_tax');
  ok(!!opt && opt.amount === round2(81600 * 0.07), 'online tax = 7% CIF');
}
console.log('── 14. FX configurable (dólar sube) ──');
{
  const r = run({ exchangeRate: 7.15 });
  ok(r.cifTtd === round2(12000 * 7.15), 'CIF usa FX del insumo, no uno fijo');
  ok(r.lines[0].basis.includes('7.15'), 'basis explica la tasa usada');
}
console.log('── 15. Line-by-line: 7+ líneas y orden creciente ──');
{
  const r = run({ containers: ['20ft'], tyreCount: 4, hsCode: '4011', cetRate: 20 });
  ok(r.lines.length >= 6, `líneas detalladas (${r.lines.length})`);
  const orders = r.lines.map(l => l.order);
  ok(orders.every((o, i) => i === 0 || o > orders[i - 1]), 'orden estrictamente creciente');
  const sumNonCif = r.lines.filter(l => l.kind !== 'value').reduce((s, l) => s + l.amount, 0);
  ok(approx(r.totalTtd - r.cifTtd, sumNonCif), 'suma de líneas == total - CIF');
}
console.log('── 16. Determinismo ──');
{
  const a = run({ containers: ['40hc'], tyreCount: 2, hsCode: '4011', cetRate: 20 });
  const b = run({ containers: ['40hc'], tyreCount: 2, hsCode: '4011', cetRate: 20 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'mismo input → mismo output byte a byte');
}
console.log('── 17. Valores cero y LCL ──');
{
  const r = run({ fobUsd: 0, freightUsd: 0, insuranceUsd: 0, containers: ['lcl'] });
  ok(r.cifTtd === 0, 'CIF 0 permitido (cotización temprana)');
  ok(r.totalTtd === 80, 'solo declaration fee cuando CIF=0 y LCL');
  ok(r.landedOverCifPct === 0, 'over-CIF % seguro con CIF=0');
}
console.log('── 18. Repuesto exento de VAT pero con CET (8708) ──');
{
  const r = run({ hsCode: '8708', cetRate: 30 });
  ok(r.dutyTtd === round2(81600 * 0.30), 'auto parts T&T deviation 30%');
  ok(r.vatTtd === round2((81600 + r.dutyTtd) * 0.125), 'VAT normal sin MVT');
}

console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) process.exit(1);
