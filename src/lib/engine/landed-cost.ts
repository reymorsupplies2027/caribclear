/**
 * CaribClear — Landed Cost Engine (pure TypeScript, 100% testable)
 * ================================================================
 * The heart of the system. NO rates are hardcoded here: every legal
 * figure comes from a versioned RateConfig snapshot (see defaults in
 * DEFAULT_RATE_CONFIG and the RateConfig table). When the law changes,
 * the admin edits the config with a new effectiveFrom date — the
 * engine never changes.
 *
 * FORMULAS (Trinidad & Tobago, 2026 — sourced from Legal Notices
 * 48/2016, 64/2016, VAT Act Chap 75:06 Sched. 2(8)(4), MVT Act
 * Chap 48:50 Fourth Schedule, 2026 fee schedule):
 *
 *   CIF_TTD        = (FOB_USD + Freight_USD + Insurance_USD) × FX
 *   Import duty    = CIF_TTD × rate  (goods: CET band; vehicles: cc bracket)
 *   MVT (vehicles) = engine_cc × per-cc rate × usedFactor (foreign-used 75%)
 *   VAT 12.5%      = exempt ? 0 : (CIF + Duty [+ MVT for vehicles]) × vatRate
 *   Tyre tax       = TT$40 per tyre
 *   Plastics tax   = 5% × CIF (single-use plastics, FY2026)
 *   Fees           = declaration TT$80 + container exam (20ft $750 / 40ft $1,050)
 *   TOTAL          = CIF + Duty + MVT + VAT + environmental + fees
 *
 * Rounding: every line rounds half-up to 2 decimals (TTD cents).
 */

export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

// ── Config types (what a versioned RateConfig snapshot looks like) ──
export interface DutyBracket { maxCc: number; rate: number }   // rate = percent
export interface MvtBracket { maxCc: number; ttdPerCc: number } // TT$ per cc

export interface RateConfigSnapshot {
  version: number;
  vatStandard: number;            // 12.5
  dutyPetrol: DutyBracket[];      // HS 8703.21-24 (≤1599:25, ≤2000:35, ≤3000:60, else 67.5)
  dutyDiesel: DutyBracket[];      // HS 8703.31-33 (≤1500:35, ≤2000:40, ≤2500:60, else 67.5)
  dutyEv: number;                 // 8703.80 electric
  mvtPetrolPerCc: MvtBracket[];   // Appendix A Part I
  mvtDieselPerCc: MvtBracket[];
  mvtForeignUsedFactor: number;   // 0.75 — foreign-used vehicles pay 75% of MVT
  customsDeclarationFeeTtd: number; // 80 (2026)
  containerExamFee: { size20: number; size40: number }; // 750 / 1050 (2026)
  environmentalTyreTaxTtd: number;  // 40 per tyre (2026)
  singleUsePlasticsRate: number;    // 5 (percent of CIF, FY2026) — applied only when flagged
  onlinePurchaseTaxRate: number;    // 7 — applied only when flagged
}

export interface VehicleInfo {
  fuel: 'petrol' | 'diesel' | 'ev' | 'hybrid';
  engineCc: number;
  used: boolean;        // foreign-used
  yearOfManufacture?: number;
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
  vatTtd: number;
  feesTtd: number;
  environmentalTtd: number;
  totalTtd: number;
  landedOverCifPct: number; // (total - CIF) / CIF × 100 — "cuánto cuesta nacionalizar"
  lines: CostLine[];
  warnings: string[];
}

const HS_VEHICLE_PREFIX = '8703';
const HS_TYRE_PREFIX = '4011';
const HS_PLASTICS_PACKAGING_PREFIX = '3923';

function dutyRateForVehicle(v: VehicleInfo, cfg: RateConfigSnapshot): number {
  if (v.fuel === 'ev') return cfg.dutyEv;
  const brackets = v.fuel === 'diesel' ? cfg.dutyDiesel : cfg.dutyPetrol;
  for (const b of brackets) {
    if (v.engineCc <= b.maxCc) return b.rate;   // bracket: cc ≤ maxCc (inclusive)
  }
  return brackets[brackets.length - 1].rate;
}

function mvtPerCc(v: VehicleInfo, cfg: RateConfigSnapshot): number {
  if (v.fuel === 'ev') return 0; // EVs: duty & MVT-free ≤ CIF TT$400k ceiling (2026)
  const brackets = v.fuel === 'diesel' ? cfg.mvtDieselPerCc : cfg.mvtPetrolPerCc;
  for (const b of brackets) {
    if (v.engineCc <= b.maxCc) return b.ttdPerCc;
  }
  return brackets[brackets.length - 1].ttdPerCc;
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
    basis: `(FOB US$${input.fobUsd.toFixed(2)} + flete US$${input.freightUsd.toFixed(2)} + seguro US$${input.insuranceUsd.toFixed(2)}) × ${input.exchangeRate}`,
    amount: cifTtd, kind: 'value', order: order++,
  });

  const isVehicle = input.hsCode.startsWith(HS_VEHICLE_PREFIX) || !!input.vehicle;
  let dutyTtd = 0;
  let mvtTtd = 0;

  if (isVehicle) {
    if (!input.vehicle) {
      warnings.push('HS 8703 requiere datos del vehículo (cilindrada, combustible, usado/nuevo). Usando tasa CET base.');
      dutyTtd = round2(cifTtd * (input.cetRate / 100));
      lines.push({ key: 'duty', label: 'Impuesto de importación (CET base)', basis: `CIF × ${input.cetRate}%`, amount: dutyTtd, kind: 'tax', order: order++ });
    } else {
      const v = input.vehicle;
      const dutyRate = dutyRateForVehicle(v, cfg);
      dutyTtd = round2(cifTtd * (dutyRate / 100));
      lines.push({
        key: 'duty', label: `Impuesto de importación (${v.fuel === 'ev' ? 'eléctrico' : v.fuel === 'diesel' ? 'diesel' : 'gasolina'}, ${v.engineCc}cc)`,
        basis: `CIF × ${dutyRate}%`,
        amount: dutyTtd, kind: 'tax', order: order++,
      });

      const perCc = mvtPerCc(v, cfg);
      if (perCc > 0) {
        const factor = v.used ? cfg.mvtForeignUsedFactor : 1;
        mvtTtd = round2(v.engineCc * perCc * factor);
        lines.push({
          key: 'mvt', label: `Motor Vehicle Tax (${v.engineCc}cc × TT$${perCc}/cc${v.used ? ' × 75% foreign-used' : ''})`,
          basis: v.used ? `${v.engineCc} × ${perCc} × 0.75` : `${v.engineCc} × ${perCc}`,
          amount: mvtTtd, kind: 'tax', order: order++,
        });
        if (v.used && v.yearOfManufacture) {
          const age = new Date().getFullYear() - v.yearOfManufacture;
          if (age > 6) warnings.push(`Vehículo usado de ${age} años: supera el límite de 6 años (Budget FY2026) — probablemente NO importable como auto privado usado.`);
          else if (age >= 5) warnings.push(`Vehículo de ${age} años: dentro del límite de 6 años, verifique inspección previa al embarque.`);
        }
      }
      if (v.fuel === 'ev') {
        if (cifTtd <= 400000) warnings.push('EV ≤ TT$400k CIF: concesión 2026 puede eximir duty y MVT — ajuste la configuración si su concesión aplica.');
      }
    }
  } else {
    dutyTtd = round2(cifTtd * (input.cetRate / 100));
    lines.push({ key: 'duty', label: 'Impuesto de importación (CET)', basis: `CIF × ${input.cetRate}%`, amount: dutyTtd, kind: 'tax', order: order++ });
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
    lines.push({ key: 'plastics_tax', label: 'Impuesto plásticos de un solo uso', basis: `CIF × ${cfg.singleUsePlasticsRate}%`, amount: plastic, kind: 'tax', order: order++ });
  }

  // 4) Customs fees
  let feesTtd = 0;
  feesTtd += cfg.customsDeclarationFeeTtd;
  lines.push({ key: 'declaration_fee', label: 'Customs declaration fee (C73)', basis: 'tarifa fija 2026', amount: cfg.customsDeclarationFeeTtd, kind: 'fee', order: order++ });

  const containers = input.containers ?? [];
  if (containers.length > 0) {
    let exam = 0;
    const parts: string[] = [];
    for (const c of containers) {
      if (c === 'lcl') continue; // LCL se factura por CBM en el puerto
      const is40 = c === '40ft' || c === '40hc';
      exam += is40 ? cfg.containerExamFee.size40 : cfg.containerExamFee.size20;
      parts.push(`${c}: TT$${is40 ? cfg.containerExamFee.size40 : cfg.containerExamFee.size20}`);
    }
    if (exam > 0) {
      exam = round2(exam);
      feesTtd += exam;
      lines.push({ key: 'container_exam', label: 'Examen de contenedores', basis: parts.join(' + '), amount: exam, kind: 'fee', order: order++ });
    }
  }

  // 5) VAT — base: CIF + duty (+ MVT for vehicles) per VAT Act Sched.2(8)(4)
  const vatBase = round2(cifTtd + dutyTtd + mvtTtd);
  const vatRate = input.vatExempt ? 0 : cfg.vatStandard;
  const vatTtd = input.vatExempt ? 0 : round2(vatBase * (vatRate / 100));
  if (input.vatExempt) {
    lines.push({ key: 'vat', label: 'VAT — EXENTO', basis: 'partida exenta (Schedule 1 VAT Act)', amount: 0, kind: 'tax', order: order++ });
  } else {
    lines.push({
      key: 'vat', label: `VAT ${cfg.vatStandard}%`,
      basis: `(CIF + duty${mvtTtd > 0 ? ' + MVT' : ''}) × ${cfg.vatStandard}% = ${vatBase.toFixed(2)} × ${cfg.vatStandard}%`,
      amount: vatTtd, kind: 'tax', order: order++,
    });
  }

  // 6) Online purchase tax (flagged)
  if (input.isOnlinePurchase && cfg.onlinePurchaseTaxRate > 0) {
    const opt = round2(cifTtd * (cfg.onlinePurchaseTaxRate / 100));
    feesTtd += opt;
    lines.push({ key: 'online_tax', label: 'Online Purchase Tax', basis: `CIF × ${cfg.onlinePurchaseTaxRate}%`, amount: opt, kind: 'tax', order: order++ });
  }

  const totalTtd = round2(cifTtd + dutyTtd + mvtTtd + vatTtd + environmentalTtd + feesTtd);
  const landedOverCifPct = cifTtd > 0 ? round2(((totalTtd - cifTtd) / cifTtd) * 100) : 0;

  return {
    cifUsd, cifTtd, exchangeRate: input.exchangeRate,
    dutyTtd, mvtTtd, vatTtd,
    feesTtd: round2(feesTtd), environmentalTtd: round2(environmentalTtd),
    totalTtd, landedOverCifPct, lines, warnings,
  };
}

/** Default config snapshot — mirrors the seed of the RateConfig table. */
export const DEFAULT_RATE_CONFIG: RateConfigSnapshot = {
  version: 1,
  vatStandard: 12.5,
  dutyPetrol: [   // maxCc inclusive: ≤1599 25%, ≤2000 35%, ≤3000 60%, >3000 67.5%
    { maxCc: 1599, rate: 25 },
    { maxCc: 2000, rate: 35 },
    { maxCc: 3000, rate: 60 },
    { maxCc: 99999999, rate: 67.5 },
  ],
  dutyDiesel: [   // ≤1500 35%, ≤2000 40%, ≤2500 60%, >2500 67.5%
    { maxCc: 1500, rate: 35 },
    { maxCc: 2000, rate: 40 },
    { maxCc: 2500, rate: 60 },
    { maxCc: 99999999, rate: 67.5 },
  ],
  dutyEv: 30,
  mvtPetrolPerCc: [  // Appendix A Part I — ≤1599 $5, ≤1799 $8, ≤1999 $15, ≤2499 $25, ≤2999 $30, ≤3499 $35, >3499 $50
    { maxCc: 1599, ttdPerCc: 5 },
    { maxCc: 1799, ttdPerCc: 8 },
    { maxCc: 1999, ttdPerCc: 15 },
    { maxCc: 2499, ttdPerCc: 25 },
    { maxCc: 2999, ttdPerCc: 30 },
    { maxCc: 3499, ttdPerCc: 35 },
    { maxCc: 99999999, ttdPerCc: 50 },
  ],
  mvtDieselPerCc: [
    { maxCc: 1599, ttdPerCc: 5 },
    { maxCc: 1799, ttdPerCc: 8 },
    { maxCc: 1999, ttdPerCc: 15 },
    { maxCc: 2499, ttdPerCc: 25 },
    { maxCc: 2999, ttdPerCc: 30 },
    { maxCc: 3499, ttdPerCc: 35 },
    { maxCc: 99999999, ttdPerCc: 50 },
  ],
  mvtForeignUsedFactor: 0.75,
  customsDeclarationFeeTtd: 80,
  containerExamFee: { size20: 750, size40: 1050 },
  environmentalTyreTaxTtd: 40,
  singleUsePlasticsRate: 5,
  onlinePurchaseTaxRate: 7,
};
