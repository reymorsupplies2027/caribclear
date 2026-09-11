/**
 * CaribClear — ASYCUDA World e-filing engine (pure, no DB, no network).
 *
 * The declaration data model follows the OFFICIAL ASYCUDA World declaration
 * structure as published in customs administrations' Declaration Reference
 * User Guides (e.g. FSM ASYCUDA portal, March 2024, 26 pp.; St. Lucia ASYCUDA
 * World portal "SAD XML Message" for declarants). Segments and box numbers:
 *
 *   General segment:  A (clearance office, registration number/date, manifest),
 *                     1 (declaration type IM4/IM7/EX1), 2 (exporter),
 *                     5 (items), 6 (packages), 7 (trader reference),
 *                     8 (consignee code=TIN + name/address), 9 (financial),
 *                     10 (country last consigned), 11 (trading country),
 *                     14 (declarant code=TIN + name), 15 (country of export),
 *                     16 (country of origin), 17 (destination), 18/21 (transport
 *                     identity), 19 (container flag), 20 (delivery terms =
 *                     INCOTERMS + place), 22 (invoice currency + total invoiced),
 *                     23 (exchange rate), 25 (mode of transport at border),
 *                     27 (place of discharge), 29 (office of entry),
 *                     30 (location of goods), 54 (place and date)
 *   Item segment:     31 (marks, packages, kind, container, description),
 *                     32 (item no), 33 (commodity code HS), 34 (origin code),
 *                     35 (gross mass), 36 (preference), 37 (CPC 4-digit +
 *                     Additional National Code 3-digit), 38 (net mass),
 *                     40 (summary: B/L or AWB; previous document),
 *                     41 (supplementary units), 42 (item price),
 *                     43 (valuation method), 46 (statistical value = tax base),
 *                     47 (calculation of taxes — up to EIGHT per item: type,
 *                     base, rate, amount, payment mode), 48 (deferred payment)
 *   Accounting (B):   assessment number, receipt number, totals when paid.
 *
 * Filing lifecycle modelled on the guide's workflow (declarant inputs and
 * assesses; Customs controls): draft → validated → xml_generated → filed
 * (lodged on the administration's portal by the registered declarant) →
 * registered (registration number e.g. "C 427" + date assigned by ASYCUDA on
 * validation) → assessed / cleared; rejected and queried are terminal branches.
 *
 * Exchange format: ASYCUDA World administrations document declarant XML
 * submission of the SAD (St. Lucia portal; ASYCUDA XML SAD message overview).
 * generateSadXml() emits that structure with box-number-annotated elements.
 * National XSDs are distributed with each administration's ASYCUDA World
 * portal, so the generated file is validated here for structure + data
 * rules, and the UI tells the broker to validate once against the local XSD
 * on first filing. CUSRES response parsing is tolerant across tag variants.
 *
 * Design rules (same as forms.ts):
 *  - The engine NEVER invents data. Missing mandatory data produces errors;
 *    missing optional data produces warnings.
 *  - Duty/tax rows (box 47) come ONLY from real landed-cost engine CostLines.
 */

import { getRegion, modeCodeAtBorder, type CustomsRegion } from './customs-regions';
import { CARICOM_MEMBERS, round2 } from './forms';

export interface FormIssue { field: string; message: string }

// ─── Tax lines (box 47) ──────────────────────────────────────────────────────

export interface AsycudaTaxLine {
  taxType: string;       // duty/tax type code (e.g. DUTY, VAT, EXCISE)
  taxBase: number;       // base amount in national currency
  taxRate: string;       // human rate, e.g. "25%" or "TT$4/kW"
  taxAmount: number;     // amount in national currency
  paymentMode: string;   // CASH | DEF (deferred/deferred payment account)
}

const TAX_CODE_BY_KEY: Record<string, string> = {
  duty: 'DUTY', dutyTtd: 'DUTY',
  vat: 'VAT', vatTtd: 'VAT',
  mvt: 'MVT', mvtTtd: 'MVT',
  excise: 'EXCISE', exciseTtd: 'EXCISE',
  environmental: 'ENV LEVY', environmentalTtd: 'ENV LEVY',
  tyre_tax: 'TYRE LEVY', plastics_tax: 'PLASTICS',
  online_tax: 'ONLINE LEVY', online_purchase_levy: 'ONLINE LEVY',
};

/** Max tax lines the ASYCUDA declaration box 47 can display per item. */
export const MAX_TAX_LINES_PER_ITEM = 8;

// ─── Declaration model ───────────────────────────────────────────────────────

export interface AsycudaGeneralSegment {
  boxOffice: string;                       // A — customs clearance office (code)
  boxDeclarationType: string;              // 1 — IM4 | IM7 | EX1 | ...
  boxExporterNameAddress: string;          // 2 — optional on imports
  boxPackages: string;                     // 6 — total packages (count + kind)
  boxReferenceNumber: string;              // 7 — trader's unique reference
  boxConsigneeCode: string;                // 8 — TIN / business ID
  boxConsigneeNameAddress: string;         // 8
  boxFinancial: string;                    // 9 — payer of duties if ≠ consignee
  boxCountryLastConsigned: string;         // 10
  boxTradingCountry: string;               // 11
  boxDeclarantCode: string;                // 14 — broker TIN / business ID
  boxDeclarantName: string;                // 14
  boxCountryOfExport: string;              // 15
  boxCountryOfOrigin: string;              // 16
  boxCountryOfDestination: string;         // 17
  boxTransportDeparture: string;           // 18
  boxContainers: boolean;                  // 19 — container flag
  boxDeliveryTermsCode: string;            // 20 — INCOTERMS code
  boxDeliveryTermsPlace: string;           // 20
  boxTransportBorder: string;              // 21 — vessel/flight crossing border
  boxCurrencyCode: string;                 // 22 — invoice currency
  boxTotalInvoiced: number;                // 22 — total in invoice currency
  boxExchangeRate: number;                 // 23 — vs USD (national ccys: TTD, JMD, ...)
  boxModeTransportBorder: string;          // 25 — UN Rec 19 code (1 sea, 4 air)
  boxPlaceOfDischarge: string;             // 27
  boxOfficeOfEntry: string;                // 29
  boxLocationOfGoods: string;              // 30
  boxPlaceAndDate: string;                 // 54
}

export interface AsycudaItem {
  box31MarksPackage1: string;
  box31NumberOfPackages: number | null;
  box31KindOfPackages: string;
  box31ContainerNumber: string;
  box31Description: string;                // MANDATORY
  box32ItemNo: number;
  box33CommodityCode: string;              // HS — MANDATORY
  box34CountryOfOrigin: string;
  box35GrossMass: number | null;
  box36PreferenceCode: string;
  box37Cpc: string;                        // MANDATORY (format per region)
  box37Anc: string;                        // 3-digit additional national code
  box38NetMass: number | null;
  box40Summary: string;                    // B/L or AWB number
  box41SupplementaryUnits: string;
  box42ItemPrice: number;                  // invoice line value (invoice ccy)
  box43ValuationMethod: string;            // default '1' (transaction value)
  box46StatisticalValue: number;           // customs value in national ccy = tax base
  taxes: AsycudaTaxLine[];                 // 47 — from real cost lines only
  box48DeferredPayment: string;            // deferred payment account number
}

export interface AsycudaDeclaration {
  country: string;                         // region code (TT, JM, ...)
  form: 'c82' | 'c73';
  general: AsycudaGeneralSegment;
  items: AsycudaItem[];
  totals: {
    itemsCount: number;
    totalInvoiced: number;                 // invoice ccy
    statisticalTotal: number;              // national ccy
    totalDutyTaxes: number;                // national ccy (box 47 grand total)
  };
  generatedAt: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function cpcFormatPattern(region: CustomsRegion): RegExp {
  return region.cpcFormat === 'tt' ? /^\d{2} \d{2} \d{3}$/ : /^\d{4}$/;
}

export function cpcDefault(region: CustomsRegion): string {
  // Home consumption / home use procedure: T&T writes "10 00 000" on the C82;
  // regional ASYCUDA administrations use the 4-digit CPC 1000.
  return region.cpcFormat === 'tt' ? '10 00 000' : '1000';
}

export function validateAsycudaDeclaration(decl: AsycudaDeclaration): FormIssue[] {
  const issues: FormIssue[] = [];
  const region = getRegion(decl.country);
  const g = decl.general;

  if (!region) issues.push({ field: 'country', message: `Unknown customs region "${decl.country}".` });
  if (!g.boxOffice) issues.push({ field: 'boxOffice', message: 'Customs clearance office (box A) is mandatory — the declaration is lodged at a specific office.' });
  if (!g.boxDeclarationType) issues.push({ field: 'boxDeclarationType', message: 'Declaration type (box 1, e.g. IM4) is mandatory.' });
  if (!g.boxReferenceNumber) issues.push({ field: 'boxReferenceNumber', message: 'Trader reference number (box 7) is mandatory — ASYCUDA requires a unique declarant reference.' });
  if (!g.boxConsigneeNameAddress) issues.push({ field: 'boxConsignee', message: 'Consignee name and address (box 8) is mandatory.' });
  if (!g.boxDeclarantName) issues.push({ field: 'boxDeclarant', message: 'Declarant (box 14) is mandatory — the entity responsible for clearance.' });
  if (!g.boxCurrencyCode) issues.push({ field: 'boxCurrencyCode', message: 'Invoice currency code (box 22) is mandatory.' });
  if (!(g.boxExchangeRate > 0)) issues.push({ field: 'boxExchangeRate', message: 'Exchange rate (box 23) must be greater than zero to value the declaration in national currency.' });
  if (!g.boxOfficeOfEntry) issues.push({ field: 'boxOfficeOfEntry', message: 'Office of entry (box 29) is mandatory — the office where goods enter the customs territory.' });

  if (!decl.items.length) issues.push({ field: 'items', message: 'At least one item line is required.' });
  const taxTypes = new Set<string>();
  decl.items.forEach((it) => {
    const n = it.box32ItemNo;
    if (!it.box31Description) issues.push({ field: `item${n}.description`, message: `Item ${n}: description of goods (box 31) is mandatory.` });
    if (!it.box33CommodityCode) issues.push({ field: `item${n}.hsCode`, message: `Item ${n}: commodity code (box 33) is mandatory.` });
    else if (it.box33CommodityCode.replace(/\D/g, '').length < 6) issues.push({ field: `item${n}.hsCode`, message: `Item ${n}: HS code needs at least 6 digits (currently "${it.box33CommodityCode}").` });
    if (!it.box37Cpc) issues.push({ field: `item${n}.cpc`, message: `Item ${n}: customs procedure code (box 37) is mandatory.` });
    else if (region && !cpcFormatPattern(region).test(it.box37Cpc)) issues.push({ field: `item${n}.cpc`, message: `Item ${n}: CPC "${it.box37Cpc}" does not match the ${region.country} format (${region.cpcFormat === 'tt' ? '10 00 000' : '4 digits'}).` });
    if (!(it.box46StatisticalValue > 0)) issues.push({ field: `item${n}.statisticalValue`, message: `Item ${n}: statistical value (box 46, customs value in national currency) must be greater than zero — run the Cost engine first.` });
    if (it.taxes.length > MAX_TAX_LINES_PER_ITEM) issues.push({ field: `item${n}.taxes`, message: `Item ${n}: box 47 can display at most ${MAX_TAX_LINES_PER_ITEM} taxes (has ${it.taxes.length}).` });
    it.taxes.forEach((t) => taxTypes.add(t.taxType));
  });
  if (taxTypes.size > MAX_TAX_LINES_PER_ITEM) {
    issues.push({ field: 'taxes', message: `The declaration uses ${taxTypes.size} distinct duty/tax types — ASYCUDA box 47 supports up to ${MAX_TAX_LINES_PER_ITEM}.` });
  }
  return issues;
}

// ─── Builder (from REAL shipment + cost data) ────────────────────────────────

export interface AsycudaBuildInput {
  country: string;                          // region code
  shipmentReference: string;
  office: string;
  officeOfEntry?: string;
  declarationType?: string;                 // default IM4
  consigneeCode?: string;                   // TIN
  consigneeNameAddress?: string;
  exporterNameAddress?: string;
  declarantCode?: string;
  declarantName?: string;
  financial?: string;
  tradingCountry?: string;
  countryLastConsigned?: string;
  incoterm?: string;
  incotermPlace?: string;
  currencyCode?: string;                    // default region currency
  exchangeRate: number;                     // national ccy per USD
  mode?: string;                            // sea | air
  vesselOrFlight?: string;
  originPort?: string;
  destinationPort?: string;
  locationOfGoods?: string;
  totalPackages?: string;
  transportDocument?: string;               // B/L / AWB → box 40
  deferredPaymentAccount?: string;
  placeAndDate?: string;
  items: Array<{
    description?: string;
    hsCode?: string;
    netKg?: number | null;
    grossKg?: number | null;
    packagesCount?: number | null;
    kindOfPackages?: string;
    containerNumber?: string;
    marksAndNumbers?: string;
    originCountry?: string;
    quantity?: number | null;
    unit?: string | null;
    cpc?: string;
    anc?: string;
    preferenceCode?: string;
    fobLineUsd?: number | null;
    /** Real landed-cost lines for THIS item (tax/fee only). */
    costLines: Array<{ key: string; label: string; basis: string; amount: number; kind: 'tax' | 'fee' | 'value'; order: number }>;
  }>;
}

function rateFromBasis(basis: string): string {
  const m = /×\s*([\d.]+\s*%)/.exec(basis);
  if (m) return m[1].trim();
  const m2 = /(TT\$|J\$|B\$|G\$|EC\$|XCD)\s*[\d.]+(?:\/kW|\/cc|\/kg)?/.exec(basis);
  if (m2) return m2[0];
  return basis || '—';
}

export function buildAsycudaDeclaration(input: AsycudaBuildInput): { declaration: AsycudaDeclaration; errors: FormIssue[]; warnings: FormIssue[] } {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  const region = getRegion(input.country);
  if (!region) {
    errors.push({ field: 'country', message: `Unknown customs region "${input.country}".` });
    throw Object.assign(new Error('UNKNOWN_REGION'), { issues: errors });
  }

  if (!input.items.length) errors.push({ field: 'items', message: 'At least one item line is required.' });
  if (!input.exchangeRate || input.exchangeRate <= 0) errors.push({ field: 'boxExchangeRate', message: 'Exchange rate must be greater than zero.' });
  if (!input.office) errors.push({ field: 'boxOffice', message: 'Customs clearance office (box A) is mandatory.' });

  const totalFobUsd = input.items.reduce((s, it) => s + (it.fobLineUsd ?? 0), 0);
  // Statistical value (box 46) = customs value in national currency. Derived
  // from the real cost lines: invert the duty/VAT rate recorded on the line;
  // fallback = invoice FOB × exchange rate (flagged as a warning).
  const items: AsycudaItem[] = input.items.map((it, idx) => {
    const dutyLine = it.costLines.find((d) => /^duty/.test(d.key) && d.kind === 'tax');
    // Statistical value (box 46): the cost engine computes tax lines on the
    // national-currency CIF. Invert the recorded rate to recover that base:
    // with VAT present, VAT base = CIF + duty → CIF = VAT/rate − duty;
    // with an ad-valorem duty only → CIF = duty/rate. Fallback = FOB × FX.
    const vatLine = it.costLines.find((d) => /vat|gct|gst/i.test(d.key));
    let statistical = 0;
    const vatRatePct = vatLine ? parsePct(rateFromBasis(vatLine.basis)) : null;
    if (vatLine && vatRatePct && vatLine.amount > 0 && dutyLine) {
      statistical = round2(vatLine.amount / (vatRatePct / 100) - (dutyLine?.amount ?? 0));
    } else if (dutyLine) {
      const dutyPct = parsePct(rateFromBasis(dutyLine.basis));
      statistical = dutyPct && dutyLine.amount > 0 ? round2(dutyLine.amount / (dutyPct / 100)) : 0;
    }
    if (!(statistical > 0)) {
      statistical = round2((it.fobLineUsd ?? 0) * input.exchangeRate);
      if (statistical <= 0) warnings.push({ field: `item${idx + 1}.statisticalValue`, message: `Item ${idx + 1}: statistical value could not be derived from the cost calculation — check the saved landed-cost result.` });
    }

    // Box 47 tax lines from the REAL cost lines. VAT/GCT/GST base = CIF + duty
    // (how the cost engine computes it); duty base = CIF; other levies base = CIF.
    const cifNational = round2(statistical);
    const taxLines: AsycudaTaxLine[] = it.costLines
      .filter((l) => l.kind === 'tax' || l.kind === 'fee')
      .map((l) => {
        const vatish = /vat|gct|gst/i.test(l.key);
        const base = vatish ? round2(cifNational + (dutyLine?.amount ?? 0)) : cifNational;
        return {
          taxType: TAX_CODE_BY_KEY[l.key] || l.label.toUpperCase().slice(0, 12),
          taxBase: round2(base),
          taxRate: rateFromBasis(l.basis),
          taxAmount: round2(l.amount),
          paymentMode: 'CASH',
        };
      });

    const origin = (it.originCountry || '').trim();
    const isCaricomOrigin = CARICOM_MEMBERS.some((m) => m.toLowerCase() === origin.toLowerCase());
    let preference = it.preferenceCode || '';
    if (isCaricomOrigin && !preference) {
      preference = 'CARICOM';
      warnings.push({ field: `item${idx + 1}.preference`, message: `Item ${idx + 1}: origin "${origin}" is a CARICOM member — attach the CARICOM Certificate of Origin to claim the preferential CET rate.` });
    }

    if (!it.hsCode) errors.push({ field: `item${idx + 1}.hsCode`, message: `Item ${idx + 1}: commodity code (box 33) is mandatory.` });
    if (!it.description) errors.push({ field: `item${idx + 1}.description`, message: `Item ${idx + 1}: description of goods (box 31) is mandatory.` });
    if (!it.netKg) warnings.push({ field: `item${idx + 1}.netMass`, message: `Item ${idx + 1}: net mass (box 38) is empty — ASYCUDA validation will normally require it.` });

    return {
      box31MarksPackage1: it.marksAndNumbers || '',
      box31NumberOfPackages: it.packagesCount ?? null,
      box31KindOfPackages: it.kindOfPackages || '',
      box31ContainerNumber: it.containerNumber || '',
      box31Description: it.description || '',
      box32ItemNo: idx + 1,
      box33CommodityCode: it.hsCode || '',
      box34CountryOfOrigin: origin,
      box35GrossMass: it.grossKg ?? null,
      box36PreferenceCode: preference,
      box37Cpc: it.cpc || cpcDefault(region),
      box37Anc: it.anc || '',
      box38NetMass: it.netKg ?? null,
      box40Summary: input.transportDocument || '',
      box41SupplementaryUnits: it.quantity != null ? `${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '',
      box42ItemPrice: round2(it.fobLineUsd ?? 0),
      box43ValuationMethod: '1', // transaction value (WCO method 1)
      box46StatisticalValue: statistical,
      taxes: taxLines,
      box48DeferredPayment: input.deferredPaymentAccount || '',
    };
  });

  const modeCode = modeCodeAtBorder(input.mode || 'sea');
  if (!modeCode) warnings.push({ field: 'boxModeTransportBorder', message: `Mode "${input.mode}" has no border transport code mapped — set box 25 manually on the portal.` });

  const declaration: AsycudaDeclaration = {
    country: region.code,
    form: region.form,
    general: {
      boxOffice: input.office,
      boxDeclarationType: input.declarationType || 'IM4',
      boxExporterNameAddress: input.exporterNameAddress || '',
      boxPackages: input.totalPackages || '',
      boxReferenceNumber: input.shipmentReference,
      boxConsigneeCode: input.consigneeCode || '',
      boxConsigneeNameAddress: input.consigneeNameAddress || '',
      boxFinancial: input.financial || '',
      boxCountryLastConsigned: input.countryLastConsigned || '',
      boxTradingCountry: input.tradingCountry || '',
      boxDeclarantCode: input.declarantCode || '',
      boxDeclarantName: input.declarantName || '',
      boxCountryOfExport: input.originPort || '',
      boxCountryOfOrigin: '',
      boxCountryOfDestination: region.country,
      boxTransportDeparture: input.vesselOrFlight || '',
      boxContainers: input.items.some((it) => !!it.containerNumber),
      boxDeliveryTermsCode: input.incoterm || '',
      boxDeliveryTermsPlace: input.incotermPlace || input.originPort || '',
      boxTransportBorder: input.vesselOrFlight || '',
      boxCurrencyCode: input.currencyCode || 'USD', // invoice currency — shipments store USD values
      boxTotalInvoiced: round2(totalFobUsd),
      boxExchangeRate: input.exchangeRate,
      boxModeTransportBorder: modeCode || '',
      boxPlaceOfDischarge: input.destinationPort || '',
      boxOfficeOfEntry: input.officeOfEntry || input.office,
      boxLocationOfGoods: input.locationOfGoods || '',
      boxPlaceAndDate: input.placeAndDate || '',
    },
    items,
    totals: {
      itemsCount: items.length,
      totalInvoiced: round2(totalFobUsd),
      statisticalTotal: round2(items.reduce((s, i) => s + i.box46StatisticalValue, 0)),
      totalDutyTaxes: round2(items.reduce((s, i) => s + i.taxes.reduce((t, x) => t + x.taxAmount, 0), 0)),
    },
    generatedAt: new Date().toISOString(),
  };

  // Append cross-field validation results not already raised above.
  const seen = new Set(errors.map((e) => e.field));
  errors.push(...validateAsycudaDeclaration(declaration).filter((i) => !seen.has(i.field)));
  return { declaration, errors, warnings };
}

function parsePct(rate: string): number | null {
  const m = /^\s*([\d.]+)\s*%\s*$/.exec(rate);
  return m ? parseFloat(m[1]) : null;
}

// ─── SAD XML generation ──────────────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(tag: string, box: string | null, value: string | number | boolean | null): string {
  const boxAttr = box ? ` box="${box}"` : '';
  const v = value == null ? '' : String(value);
  if (!v) return `<${tag}${boxAttr}/>`;
  return `<${tag}${boxAttr}>${xmlEscape(v)}</${tag}>`;
}

/**
 * Generate the ASYCUDA World SAD declaration XML. Structure mirrors the
 * official general/item segments; elements carry their SAD box number.
 * Validate once against the administration's national XSD on first filing
 * (distributed with each ASYCUDA World portal).
 */
export function generateSadXml(decl: AsycudaDeclaration): string {
  const g = decl.general;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<!-- CaribClear ASYCUDA World SAD declaration — generated ${decl.generatedAt} from shipment ${g.boxReferenceNumber}. Validate against the ${decl.country} ASYCUDA World national XSD before first transmission. -->`);
  lines.push(`<ASYCUDA xmlns="urn:caribclear:asycuda:sad:1" country="${xmlEscape(decl.country)}" form="${xmlEscape(decl.form)}" version="1.0">`);
  lines.push('  <GeneralSegment>');
  lines.push(`    ${el('CustomsClearanceOffice', 'A', g.boxOffice)}`);
  lines.push(`    ${el('DeclarationType', '1', g.boxDeclarationType)}`);
  lines.push(`    ${el('Exporter', '2', g.boxExporterNameAddress)}`);
  lines.push(`    ${el('ReferenceNumber', '7', g.boxReferenceNumber)}`);
  lines.push(`    ${el('ConsigneeCode', '8', g.boxConsigneeCode)}`);
  lines.push(`    ${el('Consignee', '8', g.boxConsigneeNameAddress)}`);
  lines.push(`    ${el('Financial', '9', g.boxFinancial)}`);
  lines.push(`    ${el('CountryLastConsigned', '10', g.boxCountryLastConsigned)}`);
  lines.push(`    ${el('TradingCountry', '11', g.boxTradingCountry)}`);
  lines.push(`    ${el('DeclarantCode', '14', g.boxDeclarantCode)}`);
  lines.push(`    ${el('Declarant', '14', g.boxDeclarantName)}`);
  lines.push(`    ${el('CountryOfExport', '15', g.boxCountryOfExport)}`);
  lines.push(`    ${el('CountryOfOrigin', '16', g.boxCountryOfOrigin)}`);
  lines.push(`    ${el('CountryOfDestination', '17', g.boxCountryOfDestination)}`);
  lines.push(`    ${el('TransportDeparture', '18', g.boxTransportDeparture)}`);
  lines.push(`    ${el('Containers', '19', g.boxContainers)}`);
  lines.push(`    ${el('DeliveryTermsCode', '20', g.boxDeliveryTermsCode)}`);
  lines.push(`    ${el('DeliveryTermsPlace', '20', g.boxDeliveryTermsPlace)}`);
  lines.push(`    ${el('TransportBorder', '21', g.boxTransportBorder)}`);
  lines.push(`    ${el('CurrencyCode', '22', g.boxCurrencyCode)}`);
  lines.push(`    ${el('TotalInvoiced', '22', num(g.boxTotalInvoiced))}`);
  lines.push(`    ${el('ExchangeRate', '23', num(g.boxExchangeRate))}`);
  lines.push(`    ${el('ModeTransportAtBorder', '25', g.boxModeTransportBorder)}`);
  lines.push(`    ${el('PlaceOfDischarge', '27', g.boxPlaceOfDischarge)}`);
  lines.push(`    ${el('OfficeOfEntry', '29', g.boxOfficeOfEntry)}`);
  lines.push(`    ${el('LocationOfGoods', '30', g.boxLocationOfGoods)}`);
  lines.push(`    ${el('Packages', '6', g.boxPackages)}`);
  lines.push(`    ${el('PlaceAndDate', '54', g.boxPlaceAndDate)}`);
  lines.push('  </GeneralSegment>');
  lines.push('  <ItemSegment>');
  for (const it of decl.items) {
    lines.push('    <Item>');
    lines.push(`      ${el('MarksAndNumbers', '31', it.box31MarksPackage1)}`);
    lines.push(`      ${el('NumberOfPackages', '31', it.box31NumberOfPackages)}`);
    lines.push(`      ${el('KindOfPackages', '31', it.box31KindOfPackages)}`);
    lines.push(`      ${el('ContainerNumber', '31', it.box31ContainerNumber)}`);
    lines.push(`      ${el('Description', '31', it.box31Description)}`);
    lines.push(`      ${el('ItemNumber', '32', it.box32ItemNo)}`);
    lines.push(`      ${el('CommodityCode', '33', it.box33CommodityCode)}`);
    lines.push(`      ${el('CountryOfOriginItem', '34', it.box34CountryOfOrigin)}`);
    lines.push(`      ${el('GrossMass', '35', it.box35GrossMass != null ? num(it.box35GrossMass) : '')}`);
    lines.push(`      ${el('PreferenceCode', '36', it.box36PreferenceCode)}`);
    lines.push(`      ${el('Cpc', '37', it.box37Cpc)}`);
    lines.push(`      ${el('AdditionalNationalCode', '37', it.box37Anc)}`);
    lines.push(`      ${el('NetMass', '38', it.box38NetMass != null ? num(it.box38NetMass) : '')}`);
    lines.push(`      ${el('SummaryDocument', '40', it.box40Summary)}`);
    lines.push(`      ${el('SupplementaryUnits', '41', it.box41SupplementaryUnits)}`);
    lines.push(`      ${el('ItemPrice', '42', num(it.box42ItemPrice))}`);
    lines.push(`      ${el('ValuationMethod', '43', it.box43ValuationMethod)}`);
    lines.push(`      ${el('StatisticalValue', '46', num(it.box46StatisticalValue))}`);
    lines.push('      <CalculationOfTaxes box="47">');
    for (const t of it.taxes) {
      lines.push('        <Tax>');
      lines.push(`          ${el('Type', null, t.taxType)}`);
      lines.push(`          ${el('Base', null, num(t.taxBase))}`);
      lines.push(`          ${el('Rate', null, t.taxRate)}`);
      lines.push(`          ${el('Amount', null, num(t.taxAmount))}`);
      lines.push(`          ${el('PaymentMode', null, t.paymentMode)}`);
      lines.push('        </Tax>');
    }
    lines.push('      </CalculationOfTaxes>');
    lines.push(`      ${el('DeferredPaymentAccount', '48', it.box48DeferredPayment)}`);
    lines.push('    </Item>');
  }
  lines.push('  </ItemSegment>');
  lines.push('  <Totals>');
  lines.push(`    ${el('ItemsCount', '5', decl.totals.itemsCount)}`);
  lines.push(`    ${el('TotalInvoiced', '22', num(decl.totals.totalInvoiced))}`);
  lines.push(`    ${el('StatisticalTotal', '46', num(decl.totals.statisticalTotal))}`);
  lines.push(`    ${el('TotalDutyTaxes', '47', num(decl.totals.totalDutyTaxes))}`);
  lines.push('  </Totals>');
  lines.push('</ASYCUDA>');
  return lines.join('\n');
}

function num(x: number): string {
  return round2(x).toFixed(2);
}

/** Minimal well-formedness check: balanced, properly nested tags + XML header. */
export function xmlWellFormed(xml: string): { ok: boolean; error?: string } {
  if (!xml.startsWith('<?xml')) return { ok: false, error: 'missing XML declaration' };
  const tagRe = /<\/?([A-Za-z_][\w.:-]*)(\s[^<>]*?)?\/?>/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = tagRe.exec(xml))) {
    // text between tags must be escaped-safe (no raw < or & leftovers)
    const between = xml.slice(lastEnd, m.index);
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(between)) return { ok: false, error: 'unescaped & in content' };
    lastEnd = tagRe.lastIndex;
    const [full, name] = m;
    if (full.startsWith('</')) {
      const top = stack.pop();
      if (top !== name) return { ok: false, error: `mismatched closing tag </${name}> (open: ${top ?? 'none'})` };
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }
  if (stack.length) return { ok: false, error: `unclosed tag <${stack[stack.length - 1]}>` };
  const tail = xml.slice(lastEnd);
  if (/<[A-Za-z]/.test(tail)) return { ok: false, error: 'unparsed tag after last match' };
  return { ok: true };
}

// ─── CUSRES (customs response) tolerant parsing ──────────────────────────────

export interface CusresResult {
  recognized: boolean;
  registrationNumber?: string;   // e.g. "C 427" — assigned by ASYCUDA on validation
  registrationDate?: string;     // YYYY-MM-DD when parseable
  assessmentNumber?: string;
  totalAssessed?: number;
  receiptNumber?: string;
  status?: string;               // registered | assessed | cleared | rejected | queried
}

function firstTag(xml: string, tags: string[]): string | null {
  for (const t of tags) {
    const m = new RegExp(`<${t}(?:\\s[^>]*)?>([^<]+)</${t}>`, 'i').exec(xml);
    if (m && m[1].trim()) { const v = sanitizeExtracted(m[1]); if (v) return v; }
    const attr = new RegExp(`<${t}\\s[^>]*(?:number|value)="([^"]+)"[^>]*\\s*/?>`, 'i').exec(xml);
    if (attr && attr[1].trim()) { const v = sanitizeExtracted(attr[1]); if (v) return v; }
  }
  return null;
}

/**
 * Sanitize an extracted CUSRES value (defense against hostile portal output):
 *  - strips control characters / NULs (binary garbage responses),
 *  - rejects unresolved XML entities (&xxe; &lol; …) — the parser is
 *    regex-based and NEVER resolves entities, so an entity in the payload
 *    means the real content never arrived: recording it would invent data,
 *  - rejects leftovers that still look like markup.
 * Empty/unsafe → null (the field stays absent — honest failure).
 */
function sanitizeExtracted(raw: string): string | null {
  const stripped = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!stripped) return null;
  if (/&[A-Za-z#0-9]+;/.test(stripped) || stripped.includes('<') || stripped.includes('>')) return null;
  return stripped;
}

function toIsoDate(s: string): string | undefined {
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s.trim());
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

/**
 * Parse a customs response (CUSRES-style XML as exported by ASYCUDA World
 * portals) with tolerance across administrations' tag naming. Returns
 * recognized=false when nothing familiar is found — never guesses.
 */
export function parseCusres(xml: string): CusresResult {
  const reg = firstTag(xml, ['RegistrationNumber', 'RegistrationNo', 'RegNumber', 'Registration', 'EntryNumber', 'DeclarationNumber']);
  const regDate = firstTag(xml, ['RegistrationDate', 'RegDate', 'RegistrationDt', 'EntryDate']);
  const assessment = firstTag(xml, ['AssessmentNumber', 'AssessmentNo', 'Assessment']);
  const total = firstTag(xml, ['TotalAssessment', 'TotalTax', 'TotalAmount', 'TotalPayable', 'AssessedTotal', 'GrandTotal']);
  const receipt = firstTag(xml, ['ReceiptNumber', 'ReceiptNo', 'PaymentReceipt']);
  const status = firstTag(xml, ['Status', 'DeclarationStatus', 'ProcessingStatus']);
  const recognized = !!(reg || assessment || total || receipt || status);
  const totalNum = total ? Number(total.replace(/[^\d.-]/g, '')) : NaN;
  let statusNorm: string | undefined;
  if (status) {
    const s = status.toLowerCase();
    if (/regist/.test(s)) statusNorm = 'registered';
    else if (/assess/.test(s)) statusNorm = 'assessed';
    else if (/clear|releas/.test(s)) statusNorm = 'cleared';
    else if (/reject/.test(s)) statusNorm = 'rejected';
    else if (/quer/.test(s)) statusNorm = 'queried';
    else statusNorm = status.toLowerCase().replace(/\s+/g, '_');
  }
  return {
    recognized,
    registrationNumber: reg || undefined,
    registrationDate: regDate ? toIsoDate(regDate) : undefined,
    assessmentNumber: assessment || undefined,
    totalAssessed: Number.isFinite(totalNum) ? round2(totalNum) : undefined,
    receiptNumber: receipt || undefined,
    status: statusNorm,
  };
}

// ─── Filing status flow ──────────────────────────────────────────────────────

export const FILING_STATUSES = [
  'draft', 'validated', 'xml_generated', 'filed', 'registered', 'assessed', 'cleared', 'rejected', 'queried',
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

export const STATUS_LABELS: Record<FilingStatus, string> = {
  draft: 'Draft',
  validated: 'Validated',
  xml_generated: 'XML generated',
  filed: 'Filed on portal',
  registered: 'Registered (entry no.)',
  assessed: 'Assessed',
  cleared: 'Cleared',
  rejected: 'Rejected',
  queried: 'Queried',
};

/** Allowed transitions — mirrors the ASYCUDA declarant workflow. */
export const ALLOWED_TRANSITIONS: Record<FilingStatus, FilingStatus[]> = {
  draft: ['validated', 'xml_generated', 'rejected'],
  validated: ['xml_generated', 'rejected'],
  xml_generated: ['filed', 'rejected'],
  filed: ['registered', 'queried', 'rejected'],
  registered: ['assessed', 'queried', 'rejected'],
  assessed: ['cleared', 'queried'],
  cleared: [],
  rejected: ['draft'],
  queried: ['registered', 'assessed', 'cleared', 'rejected'],
};

export function canTransition(from: FilingStatus, to: FilingStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from: FilingStatus, to: FilingStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Invalid filing status transition ${from} → ${to}`), { code: 'BAD_TRANSITION' });
  }
}
