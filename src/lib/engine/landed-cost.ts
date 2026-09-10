/**
 * CaribClear — Landed Cost Engine v2 (pure TypeScript, 100% testable)
 * ===================================================================
 * The heart of the system. NO rates are hardcoded here: every legal
 * figure comes from a versioned RateConfig snapshot (see DEFAULT_RATE_CONFIG
 * and the RateConfig table). When the law changes, the admin edits the
 * config with a new effectiveFrom date — the engine never changes.
 *
 * v2 (2026-08-04 instruments) — sources: First Schedule / L.N. 48 of 2016,
 * L.N. 64 of 2016, L.N. 247 of 2024, L.N. 479 of 2025 (cl. 4A/4B),
 * L.N. 613 of 2026 (in force 4 Aug 2026), MVRTA Chap 48:50 Fourth Schedule
 * Appendix A Part I items 1/6/10/11 & Part IA item 8 & paras 8/9/10,
 * VAT Act Chap 75:06 Sched. 2 items 8(2)/8(4)/43, Customs Act s.45A,
 * Budget FY2026 (used-vehicle age limits 3→6 private / 7→10 light commercial,
 * returning-national concessions removed, EV > TT$400k regime).
 *
 * FORMULAS (Trinidad & Tobago, in force Aug 2026):
 *
 *   CIF_TTD        = (FOB_USD + Freight_USD + Insurance_USD) × FX
 *   Import duty    = CIF_TTD × rate  (goods: CET band; vehicles: cc bracket / concession)
 *   MVT (vehicles) = engine_cc × per-cc rate (Appendix A Part I item 1)
 *                    × 0.75 if foreign-used (item 6, non-returning nationals)
 *   MVT (EV)       = motor_kW × $4 new / $3 used (Part IA item 8) when CIF > ceiling
 *   Excise (used)  = CIF_TTD × age-bracket rate (FY2026: 8-10y 18%, 10-20y 35%)
 *   VAT 12.5%      = exempt ? 0 : (CIF + Duty [+ MVT vehicles]) × vatRate
 *   Tyre tax       = TT$40 per tyre
 *   Plastics tax   = 5% × CIF (single-use plastics, FY2026)
 *   Fees           = declaration TT$80 + container exam (20ft $750 / 40ft $1,050)
 *   TOTAL          = CIF + Duty + MVT + Excise + VAT + environmental + fees
 *
 * Rounding: every line rounds half-up to 2 decimals (TTD cents).
 */

export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

// ── Config types (what a versioned RateConfig snapshot looks like) ──
export interface DutyBracket { maxCc: number; rate: number }   // rate = percent
export interface MvtBracket { maxCc: number; ttdPerCc: number } // TT$ per cc
/** Used-vehicle excise by age in years; maxAge null = open-ended. */
export interface ExciseBracket { minAge: number; maxAge: number | null; rate: number }

export interface RateConfigSnapshot {
  version: number;
  vatStandard: number;            // 12.5
  dutyPetrol: DutyBracket[];      // HS 8703.21-24 (≤1599:25, ≤2000:35, ≤3000:60, else 67.5)
  dutyDiesel: DutyBracket[];      // HS 8703.31-33 (≤1500:35, ≤2000:40, ≤2500:60, else 67.5)
  dutyEv: number;                 // 8703.90.00 base rate: 30
  // ── EV regime (L.N. 479/2025 cl. 4B; L.N. 613/2026; Budget FY2026) ──
  evCifCeilingTtd: number;        // 400,000 — ceiling for the private-EV concessions
  evDutyOverCeiling: number;      // 10 (percent) — budget speech "ten per cent customs duty"
  evUsedAgeLimitYears: number;    // 2 — concession scope: new, or used ≤ 2 years
  evMvtNewTtdPerKw: number;       // 4 — Appendix A Part IA item 8
  evMvtUsedTtdPerKw: number;      // 3 — Appendix A Part IA item 8
  // ── Hybrid concession, all-or-nothing (L.N. 247/2024 cl. 2-3; App. A item 11) ──
  hybridMaxCc: number;            // 1599
  hybridMaxMotorKw: number;       // 105
  hybridUsedAgeLimitYears: number;// 3
  hybridMvtNewTtdPerCc: number;   // 4
  hybridMvtUsedTtdPerCc: number;  // 3
  // ── Commercial hybrid (MVRTA Fourth Schedule para 10; VAT Sched 2 item 8(4)) ──
  commHybridMvtExemptMaxCc: number; // 1999 — no MVT, VAT exempt, standard duty
  // ── CNG (App. A item 10; Fourth Sched para 8; L.N. 479/2025 cl. 4A; L.N. 613/2026) ──
  cngPrivateMvtNewTtdPerCc: number; // 4 — private ≤1599cc
  cngPrivateMvtUsedTtdPerCc: number;// 3 — private, used ≤ 8y
  cngUsedAgeLimitYears: number;     // 8 — extended 3→8y, in force 4 Aug 2026
  cngCommDutyExemptMaxCc: number;   // 1599 — commercial CNG duty-free ≤1599cc (cl. 4A)
  // ── Returning nationals (Customs Act s.45A; App. A Part II revoked L.N. 613/2026) ──
  returningNationalDutyRelief: boolean; // true — one vehicle, ≥5y abroad, 2y transfer clawback
  returningNationalMvtFull: boolean;    // true — relief revoked 4 Aug 2026: full MVT, no 75%
  // ── Used-vehicle age limits (Budget FY2026) ──
  usedPrivateAgeLimitYears: number;      // 6 (was 3)
  usedLightCommercialAgeLimitYears: number; // 10 (was 7)
  // ── Excise on used vehicles (FY2026 revision; brackets admin-editable) ──
  exciseBrackets: ExciseBracket[];       // >8-10y 18%, >10-20y 35%
  exciseIncludedInVatBase: boolean;      // false — per published broker formula; flip if confirmed
  mvtStandardPerCc: MvtBracket[]; // Appendix A Part I item 1 (private motor cars) — same for petrol/diesel
  mvtForeignUsedFactor: number;   // 0.75 — item 6: foreign-used non-returning nationals
  customsDeclarationFeeTtd: number; // 80 (2026)
  containerExamFee: { size20: number; size40: number }; // 750 / 1050 (2026)
  environmentalTyreTaxTtd: number;  // 40 per tyre (2026)
  singleUsePlasticsRate: number;    // 5 (percent of CIF, FY2026) — applied only when flagged
  onlinePurchaseTaxRate: number;    // 7 — applied only when flagged
}

export interface VehicleInfo {
  fuel: 'petrol' | 'diesel' | 'ev' | 'hybrid' | 'cng';
  engineCc: number;     // 0 for pure EV
  motorKw?: number;     // electric motor power (required to verify EV/hybrid concessions)
  used: boolean;        // foreign-used
  yearOfManufacture?: number;
  vehicleUse?: 'private' | 'commercial'; // default private
  returningNational?: boolean;
}

export interface LandedCostInput {
  fobUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  exchangeRate: number;      // TTD per USD
  hsCode: string;
  cetRate: number;           // percent (from HsCode table)
  vatExempt?: boolean;
  vehicle?: VehicleInfo;     // present when HS = 8703
  containers?: Array<'20ft' | '40ft' | '40hc' | 'lcl'>;
  tyreCount?: number;        // HS 4011
  isSingleUsePlastics?: boolean; // HS 3923 flag
  isOnlinePurchase?: boolean;
  config: RateConfigSnapshot;
}

export interface CostLine {
  key: string;
  label: string;
  basis: string;       // human explanation, e.g. "CIF × 25%"
  amount: number;      // TTD, rounded 2
  kind: 'tax' | 'fee' | 'value';
  order: number;
}

export interface LandedCostResult {
  cifUsd: number;
  cifTtd: number;
  exchangeRate: number;
  dutyTtd: number;
  mvtTtd: number;
  exciseTtd: number;
  vatTtd: number;
  feesTtd: number;
  environmentalTtd: number;
  totalTtd: number;
  landedOverCifPct: number; // (total - CIF) / CIF × 100 — "what it costs to nationalize"
  lines: CostLine[];
  warnings: string[];
  vehicleConcession?: {    // populated for HS 8703 — explains the regime applied
    regime: string;        // e.g. 'ev_under_ceiling' | 'hybrid_ln247' | 'standard'
    instruments: string[]; // legal citations shown to the broker
  };
}

const HS_VEHICLE_PREFIX = '8703';
const HS_TYRE_PREFIX = '4011';
const HS_PLASTICS_PACKAGING_PREFIX = '3923';

/** Vehicle age in whole years from year of manufacture (null if unknown). */
export function vehicleAgeYears(v: VehicleInfo, now = new Date()): number | null {
  if (!v.yearOfManufacture || v.yearOfManufacture < 1980 || v.yearOfManufacture > now.getFullYear() + 1) return null;
  return now.getFullYear() - v.yearOfManufacture;
}

function dutyRateForVehicle(v: VehicleInfo, cfg: RateConfigSnapshot): number {
  if (v.fuel === 'ev') return cfg.dutyEv; // 8703.90.00 base — concessions applied in the vehicle branch
  const brackets = v.fuel === 'diesel' ? cfg.dutyDiesel : cfg.dutyPetrol;
  for (const b of brackets) {
    if (v.engineCc <= b.maxCc) return b.rate;   // bracket: cc ≤ maxCc (inclusive)
  }
  return brackets[brackets.length - 1].rate;
}

function mvtPerCc(v: VehicleInfo, cfg: RateConfigSnapshot): number {
  const brackets = cfg.mvtStandardPerCc;
  for (const b of brackets) {
    if (v.engineCc <= b.maxCc) return b.ttdPerCc;
  }
  return brackets[brackets.length - 1].ttdPerCc;
}

interface VehicleComputation {
  dutyRate: number;
  dutyTtd: number;
  mvtTtd: number;
  exciseTtd: number;
  vatExempt: boolean;
  regime: string;
  instruments: string[];
  dutyLabel: string;
  dutyBasis: string;
  mvtLabel?: string;
  mvtBasis?: string;
}

/**
 * Vehicle regime engine v2 — implements the real Aug-2026 instruments:
 *   EV: L.N. 479/2025 cl. 4B + L.N. 613/2026 ceiling + Part IA item 8 + VAT Sched 2 item 8(2)
 *   Hybrid private: L.N. 247/2024 cl. 2-3 (all-or-nothing) + App. A item 11
 *   Hybrid commercial: MVRTA Fourth Sched para 10 + VAT Sched 2 item 8(4)
 *   CNG: App. A item 10 (private) / para 8 + L.N. 479/2025 cl. 4A (commercial)
 *   Returning nationals: Customs Act s.45A + Part II revoked by L.N. 613/2026
 *   Standard: First Sched / L.N. 48-64 of 2016 + App. A Part I item 1 & item 6 (75%)
 */
function computeVehicle(v: VehicleInfo, cifTtd: number, inputCetRate: number, cfg: RateConfigSnapshot, warnings: string[]): VehicleComputation {
  const age = vehicleAgeYears(v);
  const isCommercial = v.vehicleUse === 'commercial';
  const res: VehicleComputation = {
    dutyRate: dutyRateForVehicle(v, cfg), dutyTtd: 0, mvtTtd: 0, exciseTtd: 0,
    vatExempt: false, regime: 'standard', instruments: [],
    dutyLabel: '', dutyBasis: '',
  };
  const stdInstruments = [
    'Duty: First Schedule — L.N. 48/2016 (petrol) / L.N. 64/2016 (diesel)',
    'MVT: MVRTA Chap 48:50 Fourth Sched., Appendix A Part I item 1',
  ];

  // ── Age limits (Budget FY2026) — private used 6y / light commercial used 10y ──
  if (v.used && age !== null) {
    const limit = isCommercial ? cfg.usedLightCommercialAgeLimitYears : cfg.usedPrivateAgeLimitYears;
    if (age > limit) {
      warnings.push(`Used vehicle ${age} years old: exceeds the ${limit}-year limit (Budget FY2026) — likely NOT importable as a used ${isCommercial ? 'light commercial vehicle' : 'private car'}.`);
    } else if (age >= limit - 1) {
      warnings.push(`Vehicle ${age} years old: within the ${limit}-year limit — verify pre-shipment inspection is arranged.`);
    }
  }

  // ── Returning nationals (Customs Act s.45A; MVT relief revoked L.N. 613/2026) ──
  if (v.returningNational) {
    if (cfg.returningNationalDutyRelief) {
      res.dutyRate = 0; res.dutyTtd = 0; res.regime = 'returning_national';
      res.dutyLabel = 'Import duty — EXEMPT (returning national)';
      res.dutyBasis = 'Customs Act s.45A: one vehicle, ≥5 years residency; recoverable if transferred within 2 years';
      res.instruments.push('Customs Act s.45A (Act 2 of 2013 s.15)');
    }
    // MVT full: item 6 (75%) excludes returning nationals; Part II relief revoked 4 Aug 2026
    const perCc = mvtPerCc(v, cfg);
    if (perCc > 0 && v.engineCc > 0) {
      res.mvtTtd = round2(v.engineCc * perCc);
      res.mvtLabel = `Motor Vehicle Tax — FULL RATE (returning national)`;
      res.mvtBasis = `${v.engineCc}cc × TT$${perCc}/cc — Part II repealed by L.N. 613/2026 (4 Aug 2026); item 6 (75%) does not apply to returning nationals`;
      res.instruments.push('MVRTA App. A Part I item 1; Part II repealed by L.N. 613/2026 cl. 2(e)(ii)');
    }
    res.instruments.push('Budget FY2026: returning-national MVT/VAT concessions removed from 1 Jan 2026');
    return res;
  }

  // ── EV regime ──
  if (v.fuel === 'ev') {
    if (!isCommercial) {
      const inAgeScope = age === null ? true : age <= cfg.evUsedAgeLimitYears; // new or used ≤2y
      if (!inAgeScope) {
        warnings.push(`Used EV ${age} years old: the private concession covers new or used ≤${cfg.evUsedAgeLimitYears} years (L.N. 247/2024 cl. 3) — applying standard rate; confirm with your broker.`);
        res.dutyRate = cfg.dutyEv;
        res.dutyTtd = round2(cifTtd * (cfg.dutyEv / 100));
        res.dutyLabel = `Import duty (EV standard 8703.90.00)`;
        res.dutyBasis = `CIF × ${cfg.dutyEv}%`;
        const kw = v.motorKw ?? 0;
        res.mvtTtd = round2(kw * cfg.evMvtUsedTtdPerKw);
        if (kw > 0) {
          res.mvtLabel = 'Motor Vehicle Tax (EV, per kW)';
          res.mvtBasis = `${kw} kW × TT$${cfg.evMvtUsedTtdPerKw}/kW (App. A Part IA item 8, used)`;
        }
        res.instruments.push('L.N. 247/2024 cl. 3; 8703.90.00 First Schedule; App. A Part IA item 8');
        res.regime = 'ev_standard_out_of_scope';
        return res;
      }
      if (cifTtd <= cfg.evCifCeilingTtd) {
        res.dutyRate = 0; res.dutyTtd = 0; res.mvtTtd = 0; res.vatExempt = true;
        res.regime = 'ev_under_ceiling';
        res.dutyLabel = 'Import duty — EXEMPT (private EV ≤ TT$400k CIF)';
        res.dutyBasis = `CIF TT$${cifTtd.toFixed(2)} ≤ TT$400,000 (L.N. 479/2025 cl. 4B)`;
        res.instruments.push(
          'Duty: L.N. 479/2025 cl. 7 inserting cl. 4B (no duty ≤ TT$400k)',
          'MVT: MVRTA Fourth Sched. para 9 + ceiling by L.N. 613/2026 cl. 2(c) (4 Aug 2026)',
          'VAT: VAT Act Sched. 2 item 8(2), Act 16 of 2021 s.10 — exempt',
        );
        return res;
      }
      // Over ceiling: budget-speech regime
      res.dutyRate = cfg.evDutyOverCeiling;
      res.dutyTtd = round2(cifTtd * (cfg.evDutyOverCeiling / 100));
      res.regime = 'ev_over_ceiling';
      res.dutyLabel = `Import duty (private EV, CIF > TT$400k)`;
      res.dutyBasis = `CIF × ${cfg.evDutyOverCeiling}% (Budget FY2026, in force 1 Jan 2026)`;
      const kw = v.motorKw ?? 0;
      const perKw = v.used ? cfg.evMvtUsedTtdPerKw : cfg.evMvtNewTtdPerKw;
      res.mvtTtd = round2(kw * perKw);
      if (kw > 0) {
        res.mvtLabel = `Motor Vehicle Tax (EV, ${kw} kW)`;
        res.mvtBasis = `${kw} kW × TT$${perKw}/kW (App. A Part IA item 8, ${v.used ? 'used' : 'new'})`;
      } else {
        warnings.push('EV over the TT$400k ceiling without motor power (kW): MVT per kW (App. A Part IA item 8) NOT calculated — enter the kW.');
      }
      res.instruments.push(
        'Duty: Budget FY2026 — 10% CIF > TT$400k (verify the remission mechanics in L.N. 479/2025 cl. 4B)',
        'MVT: MVRTA App. A Part IA item 8 — TT$4/kW new, TT$3/kW used',
        'Ceiling in force 4 Aug 2026 per L.N. 613/2026 cl. 2(c)',
      );
      return res;
    }
    // Commercial EV: no relief (former 159/179 kW exemptions repealed)
    warnings.push('Commercial EV: no relief — the former 159/179 kW exemptions were repealed (para 9 substituted); base 30% duty + MVT per kW + VAT.');
    res.dutyRate = cfg.dutyEv;
    res.dutyTtd = round2(cifTtd * (cfg.dutyEv / 100));
    res.dutyLabel = 'Import duty (commercial EV 8703.90.00)';
    res.dutyBasis = `CIF × ${cfg.dutyEv}% — no commercial relief`;
    const kw = v.motorKw ?? 0;
    const perKw = v.used ? cfg.evMvtUsedTtdPerKw : cfg.evMvtNewTtdPerKw;
    res.mvtTtd = round2(kw * perKw);
    if (kw > 0) {
      res.mvtLabel = 'Motor Vehicle Tax (commercial EV, per kW)';
      res.mvtBasis = `${kw} kW × TT$${perKw}/kW (App. A Part IA item 8)`;
    }
    res.instruments.push('MVRTA Fourth Sched. para 9 (Act 16 of 2021 s.5) — no commercial relief');
    res.regime = 'ev_commercial_no_relief';
    return res;
  }

  // ── Hybrid regime ──
  if (v.fuel === 'hybrid') {
    if (!isCommercial) {
      const kwOk = v.motorKw !== undefined && v.motorKw > 0 ? v.motorKw <= cfg.hybridMaxMotorKw : null;
      const ccOk = v.engineCc > 0 && v.engineCc <= cfg.hybridMaxCc;
      const ageOk = age === null ? true : age <= cfg.hybridUsedAgeLimitYears;
      if (kwOk === null) {
        warnings.push('Private hybrid without electric motor power (kW): the L.N. 247/2024 concession requires motor ≤ 105 kW — enter the kW to verify relief; applying standard rate.');
      } else if (ccOk && kwOk && ageOk) {
        const perCc = v.used ? cfg.hybridMvtUsedTtdPerCc : cfg.hybridMvtNewTtdPerCc;
        res.dutyRate = 0; res.dutyTtd = 0; res.regime = 'hybrid_ln247';
        res.dutyLabel = 'Import duty — EXEMPT (private hybrid L.N. 247/2024)';
        res.dutyBasis = `Criteria met: private use + ≤${cfg.hybridMaxCc}cc + electric motor ≤${cfg.hybridMaxMotorKw} kW${v.used ? ` + age ≤ ${cfg.hybridUsedAgeLimitYears} years` : ''} — all-or-nothing relief`;
        res.mvtTtd = round2(v.engineCc * perCc);
        res.mvtLabel = 'Motor Vehicle Tax (hybrid, concessionary rate)';
        res.mvtBasis = `${v.engineCc}cc × TT$${perCc}/cc (App. A item 11, ${v.used ? 'used ≤3 years' : 'new'})`;
        res.instruments.push(
          'Duty: L.N. 247/2024 cl. 2-3 — Ex 8703.40 to 8703.70 duty free',
          'MVT: MVRTA App. A items 10-11 (Act 30 of 2020 s.2(b))',
          'VAT: 12.5% PAYABLE — the exemption only applies to commercial (VAT Sched 2 item 8(4) narrowed by Act 30 of 2020 s.6)',
        );
        return res;
      } else {
        warnings.push(`Private hybrid does NOT meet L.N. 247/2024 criteria (≤${cfg.hybridMaxCc}cc${v.motorKw ? `, ≤${cfg.hybridMaxMotorKw} kW` : ''}${v.used ? `, ≤${cfg.hybridUsedAgeLimitYears} years` : ''}) — full standard duty applies (all-or-nothing).`);
      }
    } else {
      const ageOk = age === null ? true : age <= cfg.hybridUsedAgeLimitYears;
      if (v.engineCc > 0 && v.engineCc <= cfg.commHybridMvtExemptMaxCc && ageOk) {
        res.regime = 'hybrid_commercial_para10';
        res.mvtTtd = 0; res.vatExempt = true;
        res.mvtLabel = 'Motor Vehicle Tax — EXEMPT (commercial hybrid ≤1999cc)';
        res.mvtBasis = 'MVRTA Fourth Sched. para 10: new or used ≤3 years';
        res.instruments.push('MVT: MVRTA Fourth Sched. para 10 (Act 30 of 2020 s.2)', 'VAT: VAT Act Sched. 2 item 8(4) — exempt (commercial)');
        // duty standard — falls through with res.dutyRate already set
      }
    }
    // Standard duty for hybrid engine (petrol brackets)
    res.dutyTtd = round2(cifTtd * (res.dutyRate / 100));
    res.dutyLabel = `Import duty (hybrid, ${v.engineCc}cc)`;
    res.dutyBasis = `CIF × ${res.dutyRate}% (standard petrol rates)`;
    if (res.mvtTtd === 0 && res.regime !== 'hybrid_commercial_para10') {
      const perCc = mvtPerCc(v, cfg);
      if (v.engineCc > 0 && perCc > 0) {
        const factor = v.used ? cfg.mvtForeignUsedFactor : 1;
        res.mvtTtd = round2(v.engineCc * perCc * factor);
        res.mvtLabel = `Motor Vehicle Tax (${v.engineCc}cc × TT$${perCc}/cc${v.used ? ' × 75% foreign-used' : ''})`;
        res.mvtBasis = v.used ? `${v.engineCc} × ${perCc} × 0.75 (item 6)` : `${v.engineCc} × ${perCc}`;
      }
    }
    res.instruments.push(...stdInstruments);
    return res;
  }

  // ── CNG regime ──
  if (v.fuel === 'cng') {
    if (isCommercial) {
      const ageOk = age === null ? true : age <= cfg.cngUsedAgeLimitYears;
      if (ageOk) {
        res.mvtTtd = 0; res.vatExempt = true; res.regime = 'cng_commercial_para8';
        res.mvtLabel = 'Motor Vehicle Tax — EXEMPT (commercial CNG, new or used ≤8 years)';
        res.mvtBasis = 'MVRTA Fourth Sched. para 8 — extension 3→8 years by L.N. 613/2026 cl. 2(b) (4 Aug 2026)';
        if (v.engineCc > 0 && v.engineCc <= cfg.cngCommDutyExemptMaxCc) {
          res.dutyRate = 0; res.dutyTtd = 0;
          res.dutyLabel = 'Import duty — EXEMPT (commercial CNG ≤1599cc)';
          res.dutyBasis = 'L.N. 479/2025 cl. 7 inserting cl. 4A (≤1599cc, new or used ≤8 years)';
          res.instruments.push('Duty: L.N. 479/2025 cl. 4A');
        } else {
          res.dutyTtd = round2(cifTtd * (res.dutyRate / 100));
          res.dutyLabel = `Import duty (commercial CNG, ${v.engineCc}cc)`;
          res.dutyBasis = `CIF × ${res.dutyRate}% — cl. 4A covers ≤1599cc only`;
        }
        res.instruments.push('MVT: MVRTA Fourth Sched. para 8; VAT: VAT Act Sched. 2 item 43 — exempt');
        return res;
      }
      warnings.push(`Used commercial CNG ${age} years old: the para 8 exemption covers new or used ≤${cfg.cngUsedAgeLimitYears} years — applying standard rates.`);
    } else {
      // Private CNG: concessionary MVT item 10; standard duty & VAT
      const perCc = v.used ? cfg.cngPrivateMvtUsedTtdPerCc : cfg.cngPrivateMvtNewTtdPerCc;
      const ageOk = age === null ? true : age <= cfg.cngUsedAgeLimitYears;
      // Standard duty ALWAYS applies for private CNG — computed here so this
      // does not depend on the 'standard' block (the regime becomes cng_private_item10).
      res.dutyTtd = round2(cifTtd * (res.dutyRate / 100));
      res.dutyLabel = `Import duty (private CNG, ${v.engineCc}cc)`;
      res.dutyBasis = `CIF × ${res.dutyRate}% (standard rates)`;
      if (v.engineCc > 0 && v.engineCc <= cfg.hybridMaxCc && ageOk) {
        res.regime = 'cng_private_item10';
        res.mvtTtd = round2(v.engineCc * perCc);
        res.mvtLabel = 'Motor Vehicle Tax (private CNG ≤1599cc, concessionary)';
        res.mvtBasis = `${v.engineCc}cc × TT$${perCc}/cc (App. A item 10, ${v.used ? `used ≤${cfg.cngUsedAgeLimitYears} years` : 'new'})`;
        res.instruments.push('MVT: MVRTA App. A Part I item 10; 8-year extension by L.N. 613/2026 cl. 2(e)(i)', 'Standard duty and VAT for private CNG');
      } else if (!ageOk && v.engineCc <= cfg.hybridMaxCc) {
        warnings.push(`Used private CNG ${age} years old: the item 10 concessionary rate covers used ≤${cfg.cngUsedAgeLimitYears} years — applying standard MVT.`);
      }
    }
  }

  // ── Standard path (petrol / diesel / hybrid out of scope / CNG out of scope) ──
  if (res.regime === 'standard') {
    res.dutyTtd = round2(cifTtd * (res.dutyRate / 100));
    const fuelLabel = v.fuel === 'diesel' ? 'diesel' : v.fuel === 'cng' ? 'CNG' : 'petrol';
    res.dutyLabel = `Import duty (${fuelLabel}, ${v.engineCc}cc)`;
    res.dutyBasis = `CIF × ${res.dutyRate}%`;
    const perCc = mvtPerCc(v, cfg);
    if (v.engineCc > 0 && perCc > 0) {
      const factor = v.used ? cfg.mvtForeignUsedFactor : 1;
      res.mvtTtd = round2(v.engineCc * perCc * factor);
      res.mvtLabel = `Motor Vehicle Tax (${v.engineCc}cc × TT$${perCc}/cc${v.used ? ' × 75% foreign-used' : ''})`;
      res.mvtBasis = v.used ? `${v.engineCc} × ${perCc} × 0.75 (item 6)` : `${v.engineCc} × ${perCc}`;
    }
    res.instruments.push(...stdInstruments, 'Foreign-used 75%: MVRTA App. A Part I item 6 (does not apply to returning nationals)');
  }

  // ── Excise on used vehicles (FY2026: 8-10y 18%, 10-20y 35%) ──
  if (v.used && age !== null) {
    for (const b of cfg.exciseBrackets) {
      if (age > b.minAge && (b.maxAge === null || age <= b.maxAge)) {
        res.exciseTtd = round2(cifTtd * (b.rate / 100));
        res.instruments.push(`Excise: ${b.rate}% for used vehicles ${b.minAge}-${b.maxAge ?? '+'} years (FY2026 review: lowered from 20% to 18% in the 8-10y bracket)`);
        break;
      }
    }
  }
  return res;
}

/**
 * Core engine — deterministic, side-effect free, UI-agnostic.
 */
export function calculateLandedCost(input: LandedCostInput): LandedCostResult {
  const { config: cfg } = input;
  const warnings: string[] = [];
  const lines: CostLine[] = [];
  let order = 1;

  // 1) CIF
  const cifUsd = round2(input.fobUsd + input.freightUsd + input.insuranceUsd);
  const cifTtd = round2(cifUsd * input.exchangeRate);
  lines.push({
    key: 'cif', label: 'CIF (Cost, Insurance & Freight)',
    basis: `(FOB US$${input.fobUsd.toFixed(2)} + freight US$${input.freightUsd.toFixed(2)} + insurance US$${input.insuranceUsd.toFixed(2)}) × ${input.exchangeRate}`,
    amount: cifTtd, kind: 'value', order: order++,
  });

  const isVehicle = input.hsCode.startsWith(HS_VEHICLE_PREFIX) || !!input.vehicle;
  let dutyTtd = 0;
  let mvtTtd = 0;
  let exciseTtd = 0;
  let vehicleVatExempt = false;
  let concession: LandedCostResult['vehicleConcession'] | undefined;

  if (isVehicle) {
    if (!input.vehicle) {
      warnings.push('HS 8703 requires vehicle data (engine cc, fuel, used/new, kW if EV/hybrid). Using base CET rate.');
      dutyTtd = round2(cifTtd * (input.cetRate / 100));
      lines.push({ key: 'duty', label: 'Import duty (base CET)', basis: `CIF × ${input.cetRate}%`, amount: dutyTtd, kind: 'tax', order: order++ });
    } else {
      const v = input.vehicle;
      const c = computeVehicle(v, cifTtd, input.cetRate, cfg, warnings);
      dutyTtd = c.dutyTtd;
      mvtTtd = c.mvtTtd;
      exciseTtd = c.exciseTtd;
      vehicleVatExempt = c.vatExempt;
      concession = { regime: c.regime, instruments: c.instruments };
      lines.push({ key: 'duty', label: c.dutyLabel, basis: c.dutyBasis, amount: dutyTtd, kind: 'tax', order: order++ });
      if (c.mvtLabel) {
        lines.push({ key: 'mvt', label: c.mvtLabel, basis: c.mvtBasis ?? '', amount: mvtTtd, kind: 'tax', order: order++ });
      }
      if (exciseTtd > 0) {
        lines.push({ key: 'excise', label: 'Excise duty (used vehicle, by age)', basis: `CIF × age-bracket rate (FY2026)`, amount: exciseTtd, kind: 'tax', order: order++ });
      }
    }
  } else {
    dutyTtd = round2(cifTtd * (input.cetRate / 100));
    lines.push({ key: 'duty', label: 'Import duty (CET)', basis: `CIF × ${input.cetRate}%`, amount: dutyTtd, kind: 'tax', order: order++ });
  }

  // 3) Environmental charges
  let environmentalTtd = 0;
  if (input.hsCode.startsWith(HS_TYRE_PREFIX) && input.tyreCount && input.tyreCount > 0) {
    const tyre = round2(input.tyreCount * cfg.environmentalTyreTaxTtd);
    environmentalTtd += tyre;
    lines.push({ key: 'tyre_tax', label: 'Environmental Tyre Tax', basis: `${input.tyreCount} × TT$${cfg.environmentalTyreTaxTtd}`, amount: tyre, kind: 'tax', order: order++ });
  }
  if ((input.isSingleUsePlastics || input.hsCode.startsWith(HS_PLASTICS_PACKAGING_PREFIX) === false) && input.isSingleUsePlastics) {
    const plastic = round2(cifTtd * (cfg.singleUsePlasticsRate / 100));
    environmentalTtd += plastic;
    lines.push({ key: 'plastics_tax', label: 'Single-use plastics tax', basis: `CIF × ${cfg.singleUsePlasticsRate}%`, amount: plastic, kind: 'tax', order: order++ });
  }

  // 4) Customs fees
  let feesTtd = 0;
  feesTtd += cfg.customsDeclarationFeeTtd;
  lines.push({ key: 'declaration_fee', label: 'Customs declaration fee (C73)', basis: 'fixed 2026 fee', amount: cfg.customsDeclarationFeeTtd, kind: 'fee', order: order++ });

  const containers = input.containers ?? [];
  if (containers.length > 0) {
    let exam = 0;
    const parts: string[] = [];
    for (const c of containers) {
      if (c === 'lcl') continue; // LCL is billed per CBM at the port
      const is40 = c === '40ft' || c === '40hc';
      exam += is40 ? cfg.containerExamFee.size40 : cfg.containerExamFee.size20;
      parts.push(`${c}: TT$${is40 ? cfg.containerExamFee.size40 : cfg.containerExamFee.size20}`);
    }
    if (exam > 0) {
      exam = round2(exam);
      feesTtd += exam;
      lines.push({ key: 'container_exam', label: 'Container examination', basis: parts.join(' + '), amount: exam, kind: 'fee', order: order++ });
    }
  }

  // 5) VAT — base: CIF + duty (+ MVT for vehicles) per VAT Act Sched.2(8)(4)
  const vatBase = round2(cifTtd + dutyTtd + mvtTtd + (cfg.exciseIncludedInVatBase ? exciseTtd : 0));
  const vatExempt = input.vatExempt || vehicleVatExempt;
  const vatRate = vatExempt ? 0 : cfg.vatStandard;
  const vatTtd = vatExempt ? 0 : round2(vatBase * (vatRate / 100));
  if (vatExempt) {
    const reason = vehicleVatExempt
      ? concession?.regime === 'ev_under_ceiling'
        ? 'Private EV ≤ TT$400k — VAT Act Sched. 2 item 8(2), Act 16 of 2021 s.10'
        : concession?.regime === 'hybrid_commercial_para10'
          ? 'Commercial hybrid ≤1999cc — VAT Act Sched. 2 item 8(4)'
          : concession?.regime === 'cng_commercial_para8'
            ? 'Commercial CNG — VAT Act Sched. 2 item 43'
            : 'vehicle exempt under the applied regime'
      : 'exempt heading (Schedule 1 VAT Act)';
    lines.push({ key: 'vat', label: 'VAT — EXEMPT', basis: reason, amount: 0, kind: 'tax', order: order++ });
  } else {
    lines.push({
      key: 'vat', label: `VAT ${cfg.vatStandard}%`,
      basis: `(CIF + duty${mvtTtd > 0 ? ' + MVT' : ''}${cfg.exciseIncludedInVatBase && exciseTtd > 0 ? ' + excise' : ''}) × ${cfg.vatStandard}% = ${vatBase.toFixed(2)} × ${cfg.vatStandard}%`,
      amount: vatTtd, kind: 'tax', order: order++,
    });
  }

  // 6) Online purchase tax (flagged)
  if (input.isOnlinePurchase && cfg.onlinePurchaseTaxRate > 0) {
    const opt = round2(cifTtd * (cfg.onlinePurchaseTaxRate / 100));
    feesTtd += opt;
    lines.push({ key: 'online_tax', label: 'Online Purchase Tax', basis: `CIF × ${cfg.onlinePurchaseTaxRate}%`, amount: opt, kind: 'tax', order: order++ });
  }

  const totalTtd = round2(cifTtd + dutyTtd + mvtTtd + exciseTtd + vatTtd + environmentalTtd + feesTtd);
  const landedOverCifPct = cifTtd > 0 ? round2(((totalTtd - cifTtd) / cifTtd) * 100) : 0;

  return {
    cifUsd, cifTtd, exchangeRate: input.exchangeRate,
    dutyTtd, mvtTtd, exciseTtd: round2(exciseTtd), vatTtd,
    feesTtd: round2(feesTtd), environmentalTtd: round2(environmentalTtd),
    totalTtd, landedOverCifPct, lines, warnings,
    ...(concession ? { vehicleConcession: concession } : {}),
  };
}

/**
 * Migrate/repair any stored RateConfig snapshot (v1/v2 legacy shapes) to v3.
 * Missing v3 fields fall back to the current DEFAULT_RATE_CONFIG values —
 * an old snapshot in the DB can never crash the engine or zero out a tax.
 */
export function normalizeRateConfig(raw: unknown): RateConfigSnapshot {
  const d = DEFAULT_RATE_CONFIG;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const num = (k: string, fallback: number): number => {
    const v = r[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  const bool = (k: string, fallback: boolean): boolean =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : fallback;
  const brackets = (k: string, fallback: DutyBracket[]): DutyBracket[] =>
    Array.isArray(r[k]) && (r[k] as unknown[]).length > 0 ? (r[k] as DutyBracket[]) : fallback;
  const mvt = (k: string, fallback: MvtBracket[]): MvtBracket[] =>
    Array.isArray(r[k]) && (r[k] as unknown[]).length > 0 ? (r[k] as MvtBracket[]) : fallback;
  // Legacy: v1/v2 stored per-fuel MVT tables (identical content) — accept either key.
  const mvtStandard = mvt('mvtStandardPerCc', mvt('mvtPetrolPerCc', d.mvtStandardPerCc));
  const excise = Array.isArray(r.exciseBrackets) ? (r.exciseBrackets as ExciseBracket[]) : d.exciseBrackets;
  const fees = (r.containerExamFee && typeof r.containerExamFee === 'object'
    ? r.containerExamFee as Record<string, unknown> : {}) as Record<string, unknown>;
  return {
    version: Math.max(num('version', d.version), 1),
    vatStandard: num('vatStandard', d.vatStandard),
    dutyPetrol: brackets('dutyPetrol', d.dutyPetrol),
    dutyDiesel: brackets('dutyDiesel', d.dutyDiesel),
    dutyEv: num('dutyEv', d.dutyEv),
    evCifCeilingTtd: num('evCifCeilingTtd', d.evCifCeilingTtd),
    evDutyOverCeiling: num('evDutyOverCeiling', d.evDutyOverCeiling),
    evUsedAgeLimitYears: num('evUsedAgeLimitYears', d.evUsedAgeLimitYears),
    evMvtNewTtdPerKw: num('evMvtNewTtdPerKw', d.evMvtNewTtdPerKw),
    evMvtUsedTtdPerKw: num('evMvtUsedTtdPerKw', d.evMvtUsedTtdPerKw),
    hybridMaxCc: num('hybridMaxCc', d.hybridMaxCc),
    hybridMaxMotorKw: num('hybridMaxMotorKw', d.hybridMaxMotorKw),
    hybridUsedAgeLimitYears: num('hybridUsedAgeLimitYears', d.hybridUsedAgeLimitYears),
    hybridMvtNewTtdPerCc: num('hybridMvtNewTtdPerCc', d.hybridMvtNewTtdPerCc),
    hybridMvtUsedTtdPerCc: num('hybridMvtUsedTtdPerCc', d.hybridMvtUsedTtdPerCc),
    commHybridMvtExemptMaxCc: num('commHybridMvtExemptMaxCc', d.commHybridMvtExemptMaxCc),
    cngPrivateMvtNewTtdPerCc: num('cngPrivateMvtNewTtdPerCc', d.cngPrivateMvtNewTtdPerCc),
    cngPrivateMvtUsedTtdPerCc: num('cngPrivateMvtUsedTtdPerCc', d.cngPrivateMvtUsedTtdPerCc),
    cngUsedAgeLimitYears: num('cngUsedAgeLimitYears', d.cngUsedAgeLimitYears),
    cngCommDutyExemptMaxCc: num('cngCommDutyExemptMaxCc', d.cngCommDutyExemptMaxCc),
    returningNationalDutyRelief: bool('returningNationalDutyRelief', d.returningNationalDutyRelief),
    returningNationalMvtFull: bool('returningNationalMvtFull', d.returningNationalMvtFull),
    usedPrivateAgeLimitYears: num('usedPrivateAgeLimitYears', d.usedPrivateAgeLimitYears),
    usedLightCommercialAgeLimitYears: num('usedLightCommercialAgeLimitYears', d.usedLightCommercialAgeLimitYears),
    exciseBrackets: excise,
    exciseIncludedInVatBase: bool('exciseIncludedInVatBase', d.exciseIncludedInVatBase),
    mvtStandardPerCc: mvtStandard,
    mvtForeignUsedFactor: num('mvtForeignUsedFactor', d.mvtForeignUsedFactor),
    customsDeclarationFeeTtd: num('customsDeclarationFeeTtd', d.customsDeclarationFeeTtd),
    containerExamFee: {
      size20: typeof fees.size20 === 'number' ? fees.size20 : d.containerExamFee.size20,
      size40: typeof fees.size40 === 'number' ? fees.size40 : d.containerExamFee.size40,
    },
    environmentalTyreTaxTtd: num('environmentalTyreTaxTtd', d.environmentalTyreTaxTtd),
    singleUsePlasticsRate: num('singleUsePlasticsRate', d.singleUsePlasticsRate),
    onlinePurchaseTaxRate: num('onlinePurchaseTaxRate', d.onlinePurchaseTaxRate),
  };
}

/** Default config snapshot — mirrors the RateConfig seed, instruments in force Aug 2026. */
export const DEFAULT_RATE_CONFIG: RateConfigSnapshot = {
  version: 3, // v3 = Aug-2026 instruments (L.N. 613/2026 in force 4 Aug 2026)
  vatStandard: 12.5,
  dutyPetrol: [   // 8703.21-24 — L.N. 48/2016: ≤1599 25%, ≤2000 35%, ≤3000 60%, >3000 67.5%
    { maxCc: 1599, rate: 25 },
    { maxCc: 2000, rate: 35 },
    { maxCc: 3000, rate: 60 },
    { maxCc: 99999999, rate: 67.5 },
  ],
  dutyDiesel: [   // 8703.31-33 — L.N. 64/2016: ≤1500 35%, ≤2000 40%, ≤2500 60%, >2500 67.5%
    { maxCc: 1500, rate: 35 },
    { maxCc: 2000, rate: 40 },
    { maxCc: 2500, rate: 60 },
    { maxCc: 99999999, rate: 67.5 },
  ],
  dutyEv: 30,                     // 8703.90.00 "Other" base rate
  // EV regime — L.N. 479/2025 cl. 4B; ceiling re-made by L.N. 613/2026 (4 Aug 2026)
  evCifCeilingTtd: 400000,
  evDutyOverCeiling: 10,          // Budget FY2026 speech: "ten per cent customs duty"
  evUsedAgeLimitYears: 2,         // L.N. 247/2024 cl. 3: new or used ≤2 years
  evMvtNewTtdPerKw: 4,            // App. A Part IA item 8
  evMvtUsedTtdPerKw: 3,           // App. A Part IA item 8
  // Hybrid private concession — L.N. 247/2024 cl. 2-3 (all-or-nothing); App. A item 11
  hybridMaxCc: 1599,
  hybridMaxMotorKw: 105,
  hybridUsedAgeLimitYears: 3,
  hybridMvtNewTtdPerCc: 4,
  hybridMvtUsedTtdPerCc: 3,
  // Commercial hybrid — MVRTA Fourth Sched. para 10; VAT Sched. 2 item 8(4)
  commHybridMvtExemptMaxCc: 1999,
  // CNG — App. A item 10; Fourth Sched. para 8; L.N. 479/2025 cl. 4A; L.N. 613/2026
  cngPrivateMvtNewTtdPerCc: 4,
  cngPrivateMvtUsedTtdPerCc: 3,
  cngUsedAgeLimitYears: 8,        // 3→8y extension in force 4 Aug 2026
  cngCommDutyExemptMaxCc: 1599,
  // Returning nationals — Customs Act s.45A; MVT relief revoked by L.N. 613/2026
  returningNationalDutyRelief: true,
  returningNationalMvtFull: true,
  // Used-vehicle age limits — Budget FY2026 (private 3→6y; light commercial 7→10y)
  usedPrivateAgeLimitYears: 6,
  usedLightCommercialAgeLimitYears: 10,
  // Excise on used vehicles — FY2026 revision (8-10y cut 20%→18%; 10-20y 35%)
  exciseBrackets: [
    { minAge: 8, maxAge: 10, rate: 18 },
    { minAge: 10, maxAge: 20, rate: 35 },
  ],
  exciseIncludedInVatBase: false, // per published broker formula; flip when confirmed
  mvtStandardPerCc: [  // Appendix A Part I item 1 — ≤1599 $5, ≤1799 $8, ≤1999 $15, ≤2499 $25, ≤2999 $30, ≤3499 $35, >3499 $50
    { maxCc: 1599, ttdPerCc: 5 },
    { maxCc: 1799, ttdPerCc: 8 },
    { maxCc: 1999, ttdPerCc: 15 },
    { maxCc: 2499, ttdPerCc: 25 },
    { maxCc: 2999, ttdPerCc: 30 },
    { maxCc: 3499, ttdPerCc: 35 },
    { maxCc: 99999999, ttdPerCc: 50 },
  ],
  mvtForeignUsedFactor: 0.75,     // item 6 — foreign-used, persons OTHER than returning nationals
  customsDeclarationFeeTtd: 80,
  containerExamFee: { size20: 750, size40: 1050 },
  environmentalTyreTaxTtd: 40,
  singleUsePlasticsRate: 5,
  onlinePurchaseTaxRate: 7,
};
