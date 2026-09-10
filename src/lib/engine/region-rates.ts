/**
 * CaribClear — Regional landed-cost rate sets (pure data + pure math, no DB).
 *
 * Purpose: lets the platform quote GENERAL GOODS landed cost for the main
 * Caribbean trade lanes, not only Trinidad & Tobago.
 *
 * WHY THIS WORKS ACROSS CARICOM: the Common External Tariff (CET) harmonises
 * import-duty rates across CARICOM member states, so the cetRate already
 * stored per HS code applies region-wide (research/25, research/57 — caricom.org).
 * What changes per country: the sales tax (name + rate), the tax BASE,
 * national surcharges (environmental levies, customs service charges,
 * compliance fees) and the currency.
 *
 * WHAT IS DELIBERATELY NOT HERE: vehicle regimes. TT's MVT/EV/hybrid/CNG
 * concessions are national law (L.N. 247/2024, L.N. 479/2025, L.N. 613/2026).
 * Jamaica/Barbados/etc. tax vehicles with their own excise/SCT schemes that
 * are NOT calibrated here — the compute function REFUSES vehicle items
 * outside TT instead of guessing. That is the honesty rule of this file.
 *
 * EVERY rate was verified against a public source on 2026-09-11
 * (research files 50-57):
 *  - Jamaica: GCT standard 15% (PwC Tax Summaries, Dec 2025); SCF 0.3% +
 *    Environmental Levy 0.5% (Jamaica Customs Agency FAQ, jca.gov.jm);
 *    CAF is payable per JCA FAQ but the per-entry amount lives in a JCA
 *    table not mirrored here → warning, not a computed line.
 *  - Barbados: VAT 17.5% (PwC; trade.gov); VAT base = customs value + duty
 *    + other charges (published Barbados broker guide); 1% environmental
 *    levy on consignments over BD$30 (trade calculators — unverified).
 *  - Guyana: VAT 14% (PwC, Jun 2026); environmental tax GY$10 per unit of
 *    non-returnable metal/plastic/glass containers (gra.gov.gy — official).
 *  - Saint Lucia: VAT standard 12.5% (PwC Tax Summaries).
 *  - Saint Vincent & the Grenadines: import VAT 15% (customs.gov.vc FAQ —
 *    official; note the domestic standard VAT is widely cited at 16% since
 *    2017 — confirm at filing); Customs Service Charge 4% (trade
 *    calculators — unverified); duty bands 0/5/10/20/35 (customs.gov.vc).
 *  - Grenada: VAT 15% (consistently cited: stackry, FreightAmigo,
 *    oneroofautos); Customs Service Charge 6% (same sources — unverified);
 *    environmental levy 1–2% on items over EC$100 (unverified → excluded
 *    from math, surfaced as a warning).
 *  - Antigua & Barbuda: ABST 15% (KPMG; caribbean-tax.com); ABST base =
 *    CIF + duty + CSC + environmental levy (published used-vehicle/ABST
 *    guide — verified text); environmental levy ~1.5% (unverified);
 *    Revenue Recovery Charge applies per KPMG (rate not published here →
 *    warning).
 *
 * INDICATIVE RULE: like customs-regions.ts, rates marked verified:false or
 * with an asterisk are for orientation only — the real charge always comes
 * from the local tariff at filing. Tenants calibrate per-country tables in
 * Settings → Rate configuration without touching code.
 */

import { round2 } from './landed-cost';

export interface RegionSurcharge {
  key: string;              // e.g. 'jm_scf'
  label: string;            // human label shown on the breakdown
  /** Percent of the surcharge base (null when fixed per unit). */
  rate: number | null;
  base: 'cif' | 'cif_plus_duty';
  /** Fixed amount in LOCAL currency per unit (used when rate is null). */
  fixedLocalPerUnit?: number;
  unitLabel?: string;
  verified: boolean;
  note: string;
}

export interface RegionRateSet {
  code: string;             // ISO 3166-1 alpha-2
  country: string;
  currency: string;
  taxLabel: string;         // GCT | VAT | ABST
  taxRate: number;
  taxVerified: boolean;
  taxNote: string;
  /** Base the sales tax applies to. */
  taxBase: 'cif' | 'cif_plus_duty';
  taxBaseVerified: boolean;
  surcharges: RegionSurcharge[];
  /** Free-text warnings always attached to results for this country. */
  warnings: string[];
  sourceNote: string;
}

export const REGION_RATE_SETS: RegionRateSet[] = [
  {
    code: 'JM',
    country: 'Jamaica',
    currency: 'JMD',
    taxLabel: 'GCT',
    taxRate: 15,
    taxVerified: true,
    taxNote: 'Standard GCT 15% (PwC Tax Summaries — Jamaica, Dec 2025).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: false,
    surcharges: [
      {
        key: 'jm_scf', label: 'Standard Compliance Fee (SCF)', rate: 0.3, base: 'cif',
        verified: true, note: '0.3% — Jamaica Customs Agency FAQ (jca.gov.jm).',
      },
      {
        key: 'jm_envl', label: 'Environmental Levy (ENVL)', rate: 0.5, base: 'cif',
        verified: true, note: '0.5% — Jamaica Customs Agency FAQ. Trade calculators report an increase to 0.8% (May 2026) — confirm the current rate before quoting.',
      },
    ],
    warnings: [
      'Customs Administrative Fee (CAF) is payable per the JCA fee table — not included in this calculation.',
      'GCT base assumed duty-paid value (CIF + duty) — confirm against the GCT Act before quoting.',
    ],
    sourceNote: 'jca.gov.jm (SCF/ENVL/CAF FAQ) · PwC Tax Summaries Jamaica (GCT 15%)',
  },
  {
    code: 'BB',
    country: 'Barbados',
    currency: 'BBD',
    taxLabel: 'VAT',
    taxRate: 17.5,
    taxVerified: true,
    taxNote: 'Standard VAT 17.5% (PwC Tax Summaries — Barbados; trade.gov).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: true,
    surcharges: [
      {
        key: 'bb_envl', label: 'Environmental levy', rate: 1, base: 'cif',
        verified: false, note: '1% on consignments above BD$30 per trade calculators — confirm with Barbados Customs before quoting.',
      },
    ],
    warnings: [
      'Customs Service Charge may apply per published broker guides — confirm the current rate.',
    ],
    sourceNote: 'PwC / trade.gov (VAT 17.5%) · Barbados broker guide (VAT base)',
  },
  {
    code: 'GY',
    country: 'Guyana',
    currency: 'GYD',
    taxLabel: 'VAT',
    taxRate: 14,
    taxVerified: true,
    taxNote: 'Standard VAT 14% (PwC Tax Summaries — Guyana, Jun 2026).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: false,
    surcharges: [
      {
        key: 'gy_env', label: 'Environmental tax (non-returnable containers)', rate: null,
        base: 'cif', fixedLocalPerUnit: 10, unitLabel: 'unit',
        verified: true, note: 'GY$10 per unit of non-returnable metal/plastic/glass containers — gra.gov.gy (official).',
      },
    ],
    warnings: [
      'VAT base assumed duty-inclusive — confirm against the Guyana VAT Act before quoting.',
      'Duty rates on vehicles and some goods range up to 150% (PwC) — check the specific HS line.',
    ],
    sourceNote: 'gra.gov.gy (environmental tax) · PwC Guyana (VAT 14%)',
  },
  {
    code: 'LC',
    country: 'Saint Lucia',
    currency: 'XCD',
    taxLabel: 'VAT',
    taxRate: 12.5,
    taxVerified: true,
    taxNote: 'Standard VAT 12.5% (PwC Tax Summaries — Saint Lucia).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: false,
    surcharges: [],
    warnings: [
      'VAT base assumed duty-inclusive — confirm with the Inland Revenue Department before quoting.',
    ],
    sourceNote: 'PwC Tax Summaries — Saint Lucia (VAT 12.5%)',
  },
  {
    code: 'VC',
    country: 'Saint Vincent and the Grenadines',
    currency: 'XCD',
    taxLabel: 'VAT',
    taxRate: 15,
    taxVerified: true,
    taxNote: 'Import VAT 15% per the SVG Customs FAQ (customs.gov.vc — official). The domestic standard VAT is widely cited at 16% since 2017 — the official customs portal figure is used here; confirm at filing.',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: false,
    surcharges: [
      {
        key: 'vc_csc', label: 'Customs Service Charge', rate: 4, base: 'cif',
        verified: false, note: '4% per trade calculators — confirm with SVG Customs before quoting.',
      },
    ],
    warnings: [
      'Import duty bands 0/5/10/20/35% (customs.gov.vc FAQ); excise 35–60% on certain goods applies separately.',
    ],
    sourceNote: 'customs.gov.vc FAQ (duty bands, import VAT) · trade calculators (CSC)',
  },
  {
    code: 'GD',
    country: 'Grenada',
    currency: 'XCD',
    taxLabel: 'VAT',
    taxRate: 15,
    taxVerified: true,
    taxNote: 'Standard VAT 15%, consistently cited across trade references (stackry, FreightAmigo, oneroofautos).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: true,
    surcharges: [
      {
        key: 'gd_csc', label: 'Customs Service Charge', rate: 6, base: 'cif',
        verified: false, note: '6% consistently cited — confirm with Grenada Customs before quoting.',
      },
    ],
    warnings: [
      'Environmental levy 1–2% on items over EC$100 is cited but varies — not computed here; confirm before quoting.',
    ],
    sourceNote: 'stackry / FreightAmigo / oneroofautos (VAT 15%, CSC 6%, VAT base CIF+duty)',
  },
  {
    code: 'AG',
    country: 'Antigua and Barbuda',
    currency: 'XCD',
    taxLabel: 'ABST',
    taxRate: 15,
    taxVerified: true,
    taxNote: 'Standard ABST 15% (KPMG country guide; caribbean-tax.com).',
    taxBase: 'cif_plus_duty',
    taxBaseVerified: true,
    surcharges: [
      {
        key: 'ag_envl', label: 'Environmental levy', rate: 1.5, base: 'cif',
        verified: false, note: '~1.5% per trade calculators — confirm with the Customs Division before quoting.',
      },
    ],
    warnings: [
      'Revenue Recovery Charge (RRC) applies to imports per KPMG — rate not published here; confirm before quoting.',
      'ABST base per published guide: CIF + duty + CSC + environmental levy; a Customs Service Charge may apply — confirm.',
    ],
    sourceNote: 'KPMG Antigua guide (ABST 15%, RRC) · published ABST guide (base) · stackry (env levy)',
  },
];

export function getRegionRateSet(code: string): RegionRateSet | null {
  return REGION_RATE_SETS.find((r) => r.code.toUpperCase() === code.toUpperCase()) || null;
}

// ── General-goods landed cost for non-TT regions ─────────────────────────────

export interface RegionCostInput {
  fobUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  /** Local currency units per 1 USD (e.g. 155 JMD). */
  fxLocalPerUsd: number;
  hsCode: string;
  /** CARICOM CET rate in percent (from the HS table — same table all CARICOM states share). */
  cetRate: number;
  /** Count of taxable units for per-unit surcharges (e.g. Guyana containers). */
  unitCount?: number;
  rateSet: RegionRateSet;
}

export interface RegionCostLine {
  key: string;
  label: string;
  basis: string;
  amount: number;                 // local currency
  kind: 'tax' | 'fee' | 'value';
  order: number;
  verified: boolean;
}

export interface RegionCostResult {
  code: string;
  country: string;
  currency: string;
  cifUsd: number;
  cifLocal: number;
  dutyLocal: number;
  taxLocal: number;
  surchargesLocal: number;
  totalLocal: number;
  landedOverCifPct: number;
  lines: RegionCostLine[];
  warnings: string[];
  sourceNote: string;
}

export class RegionNotCalibratedError extends Error {
  code: string;
  constructor(message: string, code = 'REGION_NOT_CALIBRATED') {
    super(message);
    this.code = code;
  }
}

/**
 * General-goods landed cost for a non-TT CARICOM region, in LOCAL currency.
 * Deliberately refuses vehicles (HS 8703): each island taxes them with its
 * own excise/SCT regime that is NOT calibrated in this file.
 */
export function computeRegionLandedCost(input: RegionCostInput): RegionCostResult {
  const rs = input.rateSet;
  if (input.hsCode.startsWith('8703')) {
    throw new RegionNotCalibratedError(
      `The vehicle regime (excise/special consumption tax) for ${rs.country} is not calibrated in CaribClear yet. ` +
      `Vehicle calculations are only offered for Trinidad & Tobago. Request a calibration pack for ${rs.code}.`,
      'VEHICLE_REGIME_NOT_CALIBRATED',
    );
  }
  if (!(input.fxLocalPerUsd > 0)) {
    throw new RegionNotCalibratedError('fxLocalPerUsd must be greater than 0.', 'BAD_FX');
  }

  const warnings = [...rs.warnings];
  const cifUsd = round2(input.fobUsd + input.freightUsd + input.insuranceUsd);
  const cifLocal = round2(cifUsd * input.fxLocalPerUsd);
  const lines: RegionCostLine[] = [
    { key: 'cif', label: 'CIF', basis: 'FOB + freight + insurance', amount: cifLocal, kind: 'value', order: 0, verified: true },
  ];

  // Duty — CARICOM CET (harmonised across member states)
  const dutyLocal = round2(cifLocal * (input.cetRate / 100));
  if (dutyLocal > 0) {
    lines.push({
      key: 'duty', label: `Import duty (CARICOM CET ${input.cetRate}%)`,
      basis: `CIF ${rs.currency} × ${input.cetRate}%`, amount: dutyLocal, kind: 'tax', order: 1, verified: true,
    });
  }

  // National sales tax (GCT/VAT/ABST)
  const taxBaseCifPlusDuty = cifLocal + dutyLocal;
  const taxLocal = round2(rs.taxBase === 'cif_plus_duty' ? taxBaseCifPlusDuty * (rs.taxRate / 100) : cifLocal * (rs.taxRate / 100));
  lines.push({
    key: 'vat',
    label: `${rs.taxLabel} ${rs.taxRate}%${rs.taxVerified ? '' : ' *'}`,
    basis: rs.taxBase === 'cif_plus_duty' ? `(CIF + duty) × ${rs.taxRate}%` : `CIF × ${rs.taxRate}%`,
    amount: taxLocal, kind: 'tax', order: 2, verified: rs.taxVerified,
  });
  if (!rs.taxBaseVerified) {
    warnings.push(`${rs.taxLabel} base assumed (CIF + duty) — confirm the statutory base for ${rs.country} before quoting.`);
  }

  // National surcharges
  let surchargesLocal = 0;
  let order = 3;
  for (const sc of rs.surcharges) {
    if (sc.rate !== null) {
      const amount = round2((sc.base === 'cif_plus_duty' ? taxBaseCifPlusDuty : cifLocal) * (sc.rate / 100));
      surchargesLocal = round2(surchargesLocal + amount);
      lines.push({
        key: sc.key, label: `${sc.label} ${sc.rate}%${sc.verified ? '' : ' *'}`,
        basis: `${sc.base === 'cif_plus_duty' ? '(CIF + duty)' : 'CIF'} × ${sc.rate}%`,
        amount, kind: 'tax', order: order++, verified: sc.verified,
      });
    } else if (sc.fixedLocalPerUnit) {
      const units = Math.max(0, Math.floor(input.unitCount || 0));
      if (units > 0) {
        const amount = round2(units * sc.fixedLocalPerUnit);
        surchargesLocal = round2(surchargesLocal + amount);
        lines.push({
          key: sc.key, label: `${sc.label} (${sc.unitLabel || 'unit'})`,
          basis: `${units} × ${rs.currency} ${sc.fixedLocalPerUnit}`,
          amount, kind: 'tax', order: order++, verified: sc.verified,
        });
      } else {
        warnings.push(`${sc.label}: enter the unit count to include it (currently excluded).`);
      }
    }
  }

  const totalLocal = round2(cifLocal + dutyLocal + taxLocal + surchargesLocal);
  return {
    code: rs.code,
    country: rs.country,
    currency: rs.currency,
    cifUsd,
    cifLocal,
    dutyLocal,
    taxLocal,
    surchargesLocal,
    totalLocal,
    landedOverCifPct: cifLocal > 0 ? round2(((totalLocal - cifLocal) / cifLocal) * 100) : 0,
    lines,
    warnings,
    sourceNote: rs.sourceNote,
  };
}
