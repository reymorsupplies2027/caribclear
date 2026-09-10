/**
 * CaribClear — Landed Cost Engine v2 test suite (38 cases).
 * Run: bun tests/engine.test.ts   (also: npm run test:engine)
 * Vehicle scenarios use the REAL Aug-2026 instruments (L.N. 48/64 of 2016,
 * L.N. 247/2024, L.N. 479/2025, L.N. 613/2026, Budget FY2026) cross-checked
 * against published broker calculators: rates in force 4 Aug 2026.
 */
import {
  calculateLandedCost, round2, normalizeRateConfig, vehicleAgeYears,
  DEFAULT_RATE_CONFIG as CFG,
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
console.log('── 4. Vehículo usado gasolina 1500cc (caso masivo T&T, item 6 75%) ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2021 },
  });
  ok(r.dutyTtd === round2(81600 * 0.25), 'duty petrol ≤1599cc = 25% (L.N. 48/2016)');
  ok(r.mvtTtd === round2(1500 * 5 * 0.75), 'MVT = 1500cc × $5 × 75% foreign-used (item 6) = 5,625');
  ok(r.vatTtd === round2((81600 + r.dutyTtd + r.mvtTtd) * 0.125), 'VAT base incluye MVT (VAT Act Sched 2(8)(4))');
  ok(r.exciseTtd === 0, 'sin excise: 4-5 años < tramo 8-10y');
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
  ok(r.dutyTtd === round2(81600 * 0.60), 'duty diesel 2000-2500cc = 60% (L.N. 64/2016)');
  ok(r.mvtTtd === round2(2400 * 25 * 0.75), 'MVT diesel 1999-2499cc = $25/cc × 75%');
}
console.log('── 8. EV privado CIF ≤ TT$400k — concesión completa (L.N. 479/2025 cl.4B) ──');
{
  const r = run({
    hsCode: '8703', cetRate: 30,
    vehicle: { fuel: 'ev', engineCc: 0, used: false, motorKw: 150 },
  });
  ok(r.dutyTtd === 0, 'duty = 0 (8703.90.00 ≤ techo TT$400k)');
  ok(r.mvtTtd === 0, 'MVT = 0 (para 9 + techo L.N. 613/2026)');
  ok(r.vatTtd === 0, 'VAT exento (VAT Act Sched 2 item 8(2), Act 16/2021 s.10)');
  ok(r.totalTtd === 81600 + 80, 'total = CIF + declaración $80');
  ok(r.vehicleConcession?.regime === 'ev_under_ceiling', 'regime = ev_under_ceiling');
  ok(r.vehicleConcession?.instruments.some(i => i.includes('L.N. 479/2025')) === true, 'cita legal L.N. 479/2025 presente');
}
console.log('── 9. EV privado CIF > TT$400k — duty 10% + MVT por kW + VAT (Budget FY2026) ──');
{
  // CIF objetivo 450,000 TTD → USD = 450000/6.80 = 66176.47
  const fob = round2(450000 / 6.80 - 1500 - 500);
  const r = run({
    fobUsd: fob, hsCode: '8703', cetRate: 30,
    vehicle: { fuel: 'ev', engineCc: 0, used: false, motorKw: 150 },
  });
  ok(r.cifTtd === 450000, `CIF TT$450,000 > techo (obtuvo ${r.cifTtd})`);
  ok(r.dutyTtd === round2(450000 * 0.10), 'duty EV sobre techo = 10% (Budget FY2026, 1-Ene-2026)');
  ok(r.mvtTtd === 150 * 4, 'MVT = 150 kW × TT$4/kW nuevo (Part IA item 8) = 600');
  ok(r.vatTtd === round2((450000 + r.dutyTtd + r.mvtTtd) * 0.125), 'VAT 12.5% sobre CIF+duty+MVT');
  ok(r.vehicleConcession?.regime === 'ev_over_ceiling', 'regime = ev_over_ceiling');
}
console.log('── 10. EV usado >2 años — fuera del alcance de la concesión ──');
{
  const r = run({
    hsCode: '8703', cetRate: 30,
    vehicle: { fuel: 'ev', engineCc: 0, used: true, yearOfManufacture: 2022, motorKw: 100 },
  });
  ok(r.dutyTtd === round2(81600 * 0.30), 'EV usado 3 años → duty estándar 30% (8703.90.00)');
  ok(r.mvtTtd === 100 * 3, 'MVT = 100 kW × TT$3/kW usado');
  ok(r.warnings.some(w => w.includes('EV usado')), 'warning de alcance de concesión presente');
}
console.log('── 11. EV comercial — sin alivios ──');
{
  const r = run({
    hsCode: '8703', cetRate: 30,
    vehicle: { fuel: 'ev', engineCc: 0, used: false, motorKw: 120, vehicleUse: 'commercial' },
  });
  ok(r.dutyTtd === round2(81600 * 0.30), 'EV comercial duty 30% — exenciones 159/179 kW derogadas');
  ok(r.mvtTtd === 120 * 4, 'MVT comercial por kW sin alivio');
  ok(r.vatTtd > 0, 'VAT pagable');
}
console.log('── 12. Híbrido privado que CUMPLE L.N. 247/2024 (Axio 1496cc/72kW usado ≤3y) ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'hybrid', engineCc: 1496, used: true, yearOfManufacture: 2024, motorKw: 72 },
  });
  ok(r.dutyTtd === 0, 'duty = 0 — criterios: privado + ≤1599cc + ≤105kW + ≤3y (todo-o-nada)');
  ok(r.mvtTtd === 1496 * 3, 'MVT concesionado = 1496cc × TT$3/cc usado (App. A item 11)');
  ok(r.vatTtd > 0, 'VAT 12.5% PAGABLE para híbridos privados (Act 30/2020 s.6)');
  ok(r.vehicleConcession?.regime === 'hybrid_ln247', 'regime = hybrid_ln247');
}
console.log('── 13. Híbrido privado con motor >105 kW — pierde todo ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'hybrid', engineCc: 1496, used: false, motorKw: 130 },
  });
  ok(r.dutyTtd === round2(81600 * 0.25), 'duty estándar completo (todo-o-nada L.N. 247/2024)');
  ok(r.mvtTtd === round2(1496 * 5), 'MVT estándar item 1: 1496cc × $5 (nuevo, sin 75%)');
  ok(r.warnings.some(w => w.includes('NO cumple')), 'warning de criterios incumplidos');
}
console.log('── 14. Híbrido privado sin kW declarado — no se puede verificar ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'hybrid', engineCc: 1496, used: false },
  });
  ok(r.dutyTtd === round2(81600 * 0.25), 'sin kW → tarifa estándar (no se asume concesión)');
  ok(r.warnings.some(w => w.includes('kW')), 'warning pidiendo los kW');
}
console.log('── 15. Híbrido comercial ≤1999cc ≤3y — sin MVT + VAT exento + duty estándar ──');
{
  const r = run({
    hsCode: '8703', cetRate: 35,
    vehicle: { fuel: 'hybrid', engineCc: 1800, used: false, motorKw: 100, vehicleUse: 'commercial' },
  });
  ok(r.dutyTtd === round2(81600 * 0.35), 'duty estándar (para 10 no exime duty)');
  ok(r.mvtTtd === 0, 'MVT = 0 (Fourth Sched. para 10)');
  ok(r.vatTtd === 0, 'VAT exento (VAT Act Sched 2 item 8(4) comercial)');
  ok(r.vehicleConcession?.regime === 'hybrid_commercial_para10', 'regime = hybrid_commercial_para10');
}
console.log('── 16. CNG privado ≤1599cc — MVT concesionado item 10 ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'cng', engineCc: 1496, used: true, yearOfManufacture: 2022 },
  });
  ok(r.dutyTtd === round2(81600 * 0.25), 'duty estándar (CNG privado no exento)');
  ok(r.mvtTtd === 1496 * 3, 'MVT = 1496cc × TT$3/cc usado ≤8y (item 10 + L.N. 613/2026)');
  ok(r.vatTtd > 0, 'VAT pagable');
  ok(r.vehicleConcession?.regime === 'cng_private_item10', 'regime = cng_private_item10');
}
console.log('── 17. CNG comercial ≤1599cc ≤8y — sin duty (cl.4A), sin MVT (para 8), VAT exento ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'cng', engineCc: 1500, used: true, yearOfManufacture: 2020, vehicleUse: 'commercial' },
  });
  ok(r.dutyTtd === 0, 'duty = 0 (L.N. 479/2025 cl. 4A: ≤1599cc)');
  ok(r.mvtTtd === 0, 'MVT = 0 (para 8, extensión a 8 años)');
  ok(r.vatTtd === 0, 'VAT exento (VAT Act Sched 2 item 43)');
  ok(r.vehicleConcession?.regime === 'cng_commercial_para8', 'regime = cng_commercial_para8');
}
console.log('── 18. Returning national — duty exento s.45A, MVT TARIFA COMPLETA ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25,
    vehicle: { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2022, returningNational: true },
  });
  ok(r.dutyTtd === 0, 'duty = 0 (Customs Act s.45A: un vehículo, ≥5 años abroad)');
  ok(r.mvtTtd === round2(1500 * 5), 'MVT COMPLETO 1500 × $5 — Part II revocada (L.N. 613/2026) + item 6 no aplica');
  ok(r.vatTtd === round2((81600 + r.mvtTtd) * 0.125), 'VAT sobre CIF+MVT (duty 0)');
  ok(r.vehicleConcession?.regime === 'returning_national', 'regime = returning_national');
  ok(r.warnings.length === 0, 'returning national 3 años: dentro del límite de 6 (Budget FY2026)');
}
console.log('── 19. Vehículo >6 años (privado) genera warning crítico; comercial >10 ──');
{
  const r = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 1800, used: true, yearOfManufacture: 2018 } });
  ok(r.warnings.some(w => w.includes('NO importable')), 'warning: supera límite 6 años privado');
  const rc = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 2500, used: true, yearOfManufacture: 2018, vehicleUse: 'commercial' } });
  ok(!rc.warnings.some(w => w.includes('NO importable')), 'comercial 8 años DENTRO del límite de 10 años (Budget FY2026)');
}
console.log('── 20. Excise usado 8-10 años 18% / 10-20 años 35% (FY2026) ──');
{
  // 9 años: fabricado 2017 (2026-9)
  const r9 = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 1800, used: true, yearOfManufacture: 2017 } });
  ok(r9.exciseTtd === round2(81600 * 0.18), `excise 9 años = 18% (bajó de 20%): ${r9.exciseTtd}`);
  ok(r9.lines.some(l => l.key === 'excise'), 'línea de excise presente');
  // 12 años: fabricado 2014
  const r12 = run({ hsCode: '8703', cetRate: 35, vehicle: { fuel: 'petrol', engineCc: 1800, used: true, yearOfManufacture: 2014 } });
  ok(r12.exciseTtd === round2(81600 * 0.35), 'excise 12 años = 35%');
  // 5 años: sin excise
  const r5 = run({ hsCode: '8703', cetRate: 25, vehicle: { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2021 } });
  ok(r5.exciseTtd === 0, 'excise 5 años = 0 (bajo el tramo)');
}
console.log('── 21. Contenedores y fees 2026 ──');
{
  const r = run({ containers: ['20ft', '40ft'] });
  const exam = r.lines.find(l => l.key === 'container_exam');
  ok(!!exam && exam.amount === 750 + 1050, 'examen 20ft $750 + 40ft $1,050');
  const decl = r.lines.find(l => l.key === 'declaration_fee');
  ok(!!decl && decl.amount === 80, 'declaration fee 2026 = $80');
  ok(r.feesTtd === 80 + 1800, 'fees total = 80 + 1,800');
}
console.log('── 22. Neumáticos (4011): tyre tax ──');
{
  const r = run({ hsCode: '4011', cetRate: 20, tyreCount: 4 });
  ok(r.environmentalTtd === 160, 'tyre tax = 4 × TT$40');
}
console.log('── 23. Normalización de config legacy (v1/v2 → v3) ──');
{
  const legacy = {
    version: 1, vatStandard: 12.5,
    dutyPetrol: [{ maxCc: 1599, rate: 25 }, { maxCc: 99999999, rate: 67.5 }],
    dutyDiesel: [{ maxCc: 1500, rate: 35 }, { maxCc: 99999999, rate: 67.5 }],
    dutyEv: 30,
    mvtPetrolPerCc: [{ maxCc: 1599, ttdPerCc: 5 }, { maxCc: 99999999, ttdPerCc: 50 }],
    mvtDieselPerCc: [{ maxCc: 1599, ttdPerCc: 5 }, { maxCc: 99999999, ttdPerCc: 50 }],
    mvtForeignUsedFactor: 0.75, customsDeclarationFeeTtd: 80,
    containerExamFee: { size20: 750, size40: 1050 },
    environmentalTyreTaxTtd: 40, singleUsePlasticsRate: 5, onlinePurchaseTaxRate: 7,
  };
  const n = normalizeRateConfig(legacy);
  ok(n.mvtStandardPerCc.length === 2, 'legacy mvtPetrolPerCc migrado a mvtStandardPerCc');
  ok(n.evCifCeilingTtd === 400000, 'techo EV rellenado con default real');
  ok(n.exciseBrackets.length === 2, 'excise brackets rellenados con default real');
  ok(n.hybridMaxMotorKw === 105, 'híbrido kW rellenado');
  ok(n.dutyPetrol.length === 2, 'brackets propios del tenant PRESERVADOS');
  const n2 = normalizeRateConfig(null);
  ok(n2.version === 3 && n2.vatStandard === 12.5, 'null/garbage → default completo v3');
  const n3 = normalizeRateConfig({ garbage: 'x' });
  ok(n3.mvtStandardPerCc.length === 7 && n3.dutyPetrol.length === 4, 'objeto inválido → defaults sin crash');
}
console.log('── 24. vehicleAgeYears helper ──');
{
  ok(vehicleAgeYears({ fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2021 }) === 5, '2021 → 5 años en 2026');
  ok(vehicleAgeYears({ fuel: 'petrol', engineCc: 1500, used: true }) === null, 'sin año → null (no bloquea)');
  ok(vehicleAgeYears({ fuel: 'ev', engineCc: 0, used: false, yearOfManufacture: 2099 }) === null, 'año futuro inválido → null');
}
console.log('── 25. EV sobre techo SIN kW → MVT no calculado + warning ──');
{
  const fob = round2(450000 / 6.80 - 1500 - 500);
  const r = run({ fobUsd: fob, hsCode: '8703', cetRate: 30, vehicle: { fuel: 'ev', engineCc: 0, used: false } });
  ok(r.dutyTtd === 45000, 'duty 10% calculado aunque falte kW');
  ok(r.mvtTtd === 0, 'MVT 0 sin kW (no se inventa)');
  ok(r.warnings.some(w => w.includes('kW')), 'warning exigiendo kW para Part IA item 8');
}
console.log('── 26. Totales del vehículo usado gasolina estándar (escenario completo) ──');
{
  const r = run({
    hsCode: '8703', cetRate: 25, containers: ['40ft'],
    vehicle: { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2023 },
  });
  const expected = round2(81600 + r.dutyTtd + r.mvtTtd + r.exciseTtd + r.vatTtd + r.environmentalTtd + r.feesTtd);
  ok(r.totalTtd === expected, 'total = CIF+duty+MVT+excise+VAT+env+fees');
  ok(r.landedOverCifPct > 45, `nationalizar un carro usado cuesta ~50% sobre CIF (${r.landedOverCifPct}%)`);
}

console.log(`\n════════════════════════════════`);
console.log(`RESULTADO: ${passed} pasaron, ${failed} fallaron`);
console.log(`════════════════════════════════\n`);
if (failed > 0) process.exit(1);
