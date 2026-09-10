/**
 * CaribClear — Regional landed-cost engine test suite (region-rates.ts).
 * Run: bun tests/region-rates.test.ts
 * Every expected figure below is computed BY HAND from the rate sets in
 * region-rates.ts — the same figures a broker would get with a calculator.
 * Sources: research/50-57 (JCA FAQ, PwC, GRA, customs.gov.vc, trade guides).
 */
import {
  REGION_RATE_SETS, getRegionRateSet, computeRegionLandedCost,
  RegionNotCalibratedError,
} from '../src/lib/engine/region-rates';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function approx(a: number, b: number, tol = 0.02) { return Math.abs(a - b) <= tol; }

const jm = getRegionRateSet('JM')!;
const bb = getRegionRateSet('BB')!;
const gy = getRegionRateSet('GY')!;
const lc = getRegionRateSet('LC')!;
const vc = getRegionRateSet('VC')!;
const gd = getRegionRateSet('GD')!;
const ag = getRegionRateSet('AG')!;

console.log('\n── 1. Registry sanity ──');
ok(REGION_RATE_SETS.length === 7, '7 regional rate sets (JM/BB/GY/LC/VC/GD/AG)');
ok(getRegionRateSet('jm') === jm, 'lookup is case-insensitive');
ok(getRegionRateSet('ZZ') === null, 'unknown region → null');
ok(jm.taxRate === 15 && jm.taxLabel === 'GCT' && jm.taxVerified, 'JM GCT 15% verified (PwC)');
ok(jm.surcharges.some(s => s.key === 'jm_scf' && s.rate === 0.3 && s.verified), 'JM SCF 0.3% verified (JCA)');
ok(jm.surcharges.some(s => s.key === 'jm_envl' && s.rate === 0.5 && s.verified), 'JM ENVL 0.5% verified (JCA)');
ok(bb.taxRate === 17.5 && bb.taxBaseVerified, 'BB VAT 17.5% + verified base (PwC / broker guide)');
ok(gy.surcharges.some(s => s.key === 'gy_env' && s.fixedLocalPerUnit === 10 && s.verified), 'GY env tax GY$10/unit verified (GRA)');
ok(lc.taxRate === 12.5, 'LC VAT 12.5% (PwC)');
ok(vc.taxRate === 15 && vc.taxVerified, 'VC import VAT 15% (customs.gov.vc FAQ)');
ok(gd.taxRate === 15, 'GD VAT 15% (trade references)');
ok(ag.taxLabel === 'ABST' && ag.taxRate === 15 && ag.taxVerified, 'AG ABST 15% (KPMG)');

console.log('\n── 2. Jamaica general goods (hand-computed) ──');
// CIF USD 12,000; FX 155 JMD/USD → CIF JMD 1,860,000; CET 20% → duty 372,000
// GCT 15% of (1,860,000+372,000)=2,232,000 → 334,800; SCF 0.3% of CIF → 5,580; ENVL 0.5% → 9,300
// Total = 1,860,000 + 372,000 + 334,800 + 5,580 + 9,300 = 2,581,680
const rjm = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 155,
  hsCode: '8528', cetRate: 20, rateSet: jm,
});
ok(rjm.currency === 'JMD', 'result in JMD');
ok(approx(rjm.cifLocal, 1860000), 'CIF JMD 1,860,000');
ok(approx(rjm.dutyLocal, 372000), 'duty (CET 20%) JMD 372,000');
ok(approx(rjm.taxLocal, 334800), 'GCT 15% on duty-paid value JMD 334,800');
ok(approx(rjm.surchargesLocal, 14880), 'SCF+ENVL JMD 14,880');
ok(approx(rjm.totalLocal, 2581680), 'total JMD 2,581,680');
ok(approx(rjm.landedOverCifPct, 38.8), '+38.8% over CIF');
ok(rjm.warnings.some(w => w.includes('CAF')), 'CAF warning present (honest scope)');

console.log('\n── 3. Barbados (CET 0 → VAT on CIF) ──');
// CIF USD 12,000; FX 2.0 BBD/USD → 24,000 BBD; duty 0; VAT 17.5% → 4,200; env levy 1% → 240
const rbb = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 2,
  hsCode: '8517', cetRate: 0, rateSet: bb,
});
ok(approx(rbb.dutyLocal, 0), 'duty 0 (CET 0%)');
ok(approx(rbb.taxLocal, 4200), 'VAT 17.5% BBD 4,200');
ok(rbb.lines.some(l => l.key === 'bb_envl' && !l.verified), 'env levy marked unverified');
ok(approx(rbb.totalLocal, 28440), 'total BBD 28,440');

console.log('\n── 4. Guyana per-unit environmental tax ──');
// CIF USD 12,000; FX 210 → GYD 2,520,000; CET 10% → 252,000; VAT 14% of 2,772,000 → 388,080; env 5×10=50
const rgy = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 210,
  hsCode: '8517', cetRate: 10, unitCount: 5, rateSet: gy,
});
ok(approx(rgy.taxLocal, 388080), 'VAT 14% GYD 388,080');
ok(approx(rgy.surchargesLocal, 50), 'env tax 5 units × GY$10 = GYD 50');
ok(approx(rgy.totalLocal, 3160130), 'total GYD 3,160,130');
// Without units → excluded with warning
const rgy0 = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 210,
  hsCode: '8517', cetRate: 10, rateSet: gy,
});
ok(rgy0.warnings.some(w => w.includes('unit count')), 'unit count warning when omitted');

console.log('\n── 5. Saint Lucia / SVG / Grenada / Antigua ──');
const rlc = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 2.7,
  hsCode: '8471', cetRate: 5, rateSet: lc,
});
// CIF XCD 32,400; duty 5% → 1,620; VAT 12.5% of 34,020 → 4,252.50
ok(approx(rlc.taxLocal, 4252.5), 'LC VAT 12.5% XCD 4,252.50');
ok(approx(rlc.totalLocal, 38272.5), 'LC total XCD 38,272.50');

const rvc = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 2.7,
  hsCode: '8471', cetRate: 20, rateSet: vc,
});
ok(rvc.lines.find(l => l.key === 'vat')?.label.includes('VAT 15%') === true, 'VC VAT 15% label (official FAQ)');
ok(rvc.lines.find(l => l.key === 'vc_csc')?.label.includes('*') === true, 'VC CSC unverified shows asterisk');

const rgd = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 2.7,
  hsCode: '6109', cetRate: 20, rateSet: gd,
});
ok(approx(rgd.surchargesLocal, 32400 * 0.06), 'GD CSC 6% of CIF');
ok(rgd.warnings.some(w => w.includes('Environmental levy')), 'GD env levy warning (excluded from math)');

const rag = computeRegionLandedCost({
  fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 2.7,
  hsCode: '6109', cetRate: 20, rateSet: ag,
});
ok(rag.lines.find(l => l.key === 'vat')?.label.includes('ABST 15%') === true && rag.lines.find(l => l.key === 'vat')?.label.includes('*') === false, 'AG ABST 15% verified (no asterisk)');
ok(rag.warnings.some(w => w.includes('Revenue Recovery Charge')), 'AG RRC warning (KPMG)');

console.log('\n── 6. Honesty guards ──');
let threw = false;
try {
  computeRegionLandedCost({ fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500, fxLocalPerUsd: 155, hsCode: '8703', cetRate: 50, rateSet: jm });
} catch (e) {
  threw = e instanceof RegionNotCalibratedError && e.code === 'VEHICLE_REGIME_NOT_CALIBRATED';
}
ok(threw, 'vehicles refused outside TT with VEHICLE_REGIME_NOT_CALIBRATED');

threw = false;
try {
  computeRegionLandedCost({ fobUsd: 100, freightUsd: 0, insuranceUsd: 0, fxLocalPerUsd: 0, hsCode: '8471', cetRate: 5, rateSet: lc });
} catch (e) {
  threw = e instanceof RegionNotCalibratedError && e.code === 'BAD_FX';
}
ok(threw, 'fx ≤ 0 refused with BAD_FX');

// Lines sum to total (internal consistency across ALL regions)
let consistent = true;
for (const rs of REGION_RATE_SETS) {
  const r = computeRegionLandedCost({
    fobUsd: 7777.55, freightUsd: 432.1, insuranceUsd: 21.35, fxLocalPerUsd: 3.14159,
    hsCode: '8517', cetRate: 10, unitCount: 3, rateSet: rs,
  });
  const sum = r.lines.filter(l => l.key !== 'cif').reduce((s, l) => s + l.amount, 0);
  if (Math.abs(sum + r.cifLocal - r.totalLocal) > 0.03) consistent = false;
  if (r.lines.some(l => !Number.isFinite(l.amount) || l.amount < 0)) consistent = false;
}
ok(consistent, 'all 7 regions: lines + CIF = total, no negative/NaN lines');

console.log(`\n════════════════════════════════`);
console.log(`RESULTADO: ${passed} pasaron, ${failed} fallaron`);
console.log(`════════════════════════════════\n`);
if (failed > 0) process.exit(1);
