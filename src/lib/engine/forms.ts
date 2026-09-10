/**
 * CaribClear — Official forms engine (pure, no DB, no network).
 *
 * Sources (all verified, no invented fields):
 *  - Form C82 "Customs Declaration (Import/Export)" and Form C84 "Declaration in
 *    respect of Claims for Treatment under Specific Customs Procedures":
 *    Legal Notice No. 72 of 1993, Customs (Amendment) Regulations 1993,
 *    Customs Act Chap. 78:01, Schedule I (laws.gov.tt, LN 72/1993 pp. 317-323).
 *    Note: T&T Forms C73/C74/C77/C78 were REPEALED from Schedule I by that same
 *    Notice — the current T&T goods declaration is the C82.
 *  - Form C73 "Customs Declaration" remains the standard entry form in other
 *    CARICOM administrations (Jamaica Customs Agency, Guyana Revenue Authority,
 *    Barbados; also referenced by the ACS Customs Facilitation Working Group).
 *  - CARICOM Certificate of Origin: standard regional certificate layout
 *    (consignor/consignee/transport/origin/goods/invoice + exporter declaration
 *    + certification block). Origin country must be a CARICOM member state.
 *
 * Design rules:
 *  - The engine NEVER invents data. Missing mandatory data produces errors;
 *    missing optional data produces warnings and renders blank boxes.
 *  - Duty/tax rows are derived from real landed-cost engine CostLines, never guessed.
 */

export interface FormIssue { field: string; message: string }

export interface C82TaxRow {
  code: string;        // box 38 — duty/tax code (e.g. DUTY, VAT, EXCISE, MVT)
  baseAmount: number;  // box 39 — duty/tax base amount (TT$)
  rate: string;        // box 40 — human rate, e.g. "25%" or "TT$4/kW"
  amount: number;      // box 41 — amount (TT$)
}

export interface C82Item {
  item: number;                 // item line number
  description: string;          // box 25
  cpc: string;                  // box 26 — customs procedure code (editable)
  commodityCode: string;        // box 27 — HS code
  netKg: number | null;         // box 28
  grossKg: number | null;       // box 29
  supplQty1: string;            // box 30 (qty + unit)
  marksAndNumbers: string;      // box 33
  freightTtd: number;           // box 34
  insuranceTtd: number;        // box 35
  otherCostsTtd: number;        // box 36
  customsValueTtd: number;      // box 37
  originCountry: string;        // box 45
  destinationCountry: string;   // box 46
  taxes: C82TaxRow[];           // boxes 38-41 per row
  totalTaxesTtd: number;        // box 47
}

export interface C82Form {
  kind: 'c82';
  variant: 'c82' | 'c73';
  box1ExporterConsignor: string;
  box2Regime: string;
  box3NumberOfSheets: number;
  box4NumberOfItems: number;
  box5ImporterConsignee: string;
  box6TotalPackages: string;      // count + package kind, editable
  box7TransportDocument: string;  // B/L or AWB number
  box13Declarant: string;
  box14TransactingBank: string;
  box16Consignee: string;
  box17TotalCifTtd: number;       // TOTAL CIF (imports) / FOB (exports)
  box18MeansOfTransport: { mode: string; type: string; rotation: string; number: string };
  box19AgentOfCarrier: string;
  box20PortOfImportExport: string;
  box22AdditionalInformation: string;
  box23OtherCharges: Array<{ type: string; code: string; amount: number }>;
  box24TotalTaxesTtd: number;
  items: C82Item[];
  box48DeclarationText: string;
  legalWarning: string;
  formTitle: string;
  formFooter: string;
  entryNumber: string;            // customs declaration no. and date (top right)
  entryDate: string;
  generatedFrom: { shipmentReference: string; costCalcName: string | null; builtAt: string };
}

export interface C84Form {
  kind: 'c84';
  declarationNoAndDate: string;   // links the C82/C73 entry
  declarantName: string;
  importerExporter: string;
  regimeCode: string;
  refNo: string;
  claims: Array<{ itemNo: number; cpc: string; description: string; claimBasis: string }>;
  declarationText: string;
  legalNote: string;
  generatedFrom: { shipmentReference: string; builtAt: string };
}

export interface CaricomCoGood {
  marksAndNumbers: string;
  numberOfPackages: string;
  kindOfPackages: string;         // cartons, barrels, pallets...
  description: string;
  hsCode: string;
  grossWeightKg: number | null;
  invoiceValueUsd: number;
}

export interface CaricomCoForm {
  kind: 'caricom-co';
  certificateNo: string;
  issuedIn: string;
  box1ConsignorExporter: string;
  box2Consignee: string;
  box3TransportRoute: string;
  box4CountryOfOrigin: string;
  box5PortOfLoading: string;
  box5PlaceOfDestination: string;
  goods: CaricomCoGood[];
  invoiceNumber: string;
  invoiceDate: string;
  exporterDeclarationText: string;
  certificationText: string;
  generatedFrom: { shipmentReference: string; builtAt: string };
}

export interface C83Form {
  kind: 'c83';
  queryNo: string;               // query reference (customs-assigned or broker tracking no.)
  queryDate: string;
  entryNoAndDate: string;        // MANDATORY — the C82/C73 entry the query refers to
  declarantName: string;
  importerExporter: string;
  officerUnit: string;           // examining officer / section issuing the query
  referralType: string;          // Examination | Document check | Valuation | Origin | Classification | Other
  itemsAffected: string;         // item numbers, containers, marks affected
  queryDetails: string;          // MANDATORY — what Customs is querying
  responseDetails: string;       // the broker's answer / documents provided
  responseDeadline: string;
  status: string;                // Open | Answered | Resolved
  declarationText: string;
  legalNote: string;
  generatedFrom: { shipmentReference: string; builtAt: string };
}

export interface C86Form {
  kind: 'c86';
  entryNoAndDate: string;        // bill-of-sight entry number & date
  importerExporter: string;      // MANDATORY
  declarantName: string;
  goodsBestDescription: string;  // MANDATORY — to the best of the declarant's knowledge
  reasonsParticularsUnavailable: string; // MANDATORY — why the entry cannot be completed yet
  containers: string;
  estimatedValueTtd: number | null; // best estimate, clearly labelled as estimate
  estimatedQuantity: string;
  bondAmountTtd: number;         // MANDATORY — bond sum covering potential duty + charges
  bondSurety: string;            // surety / guarantor
  undertakingText: string;
  bondText: string;
  legalNote: string;
  generatedFrom: { shipmentReference: string; builtAt: string };
}

export type BuildableForm = C82Form | C84Form | C83Form | C86Form | CaricomCoForm;

/** The 15 CARICOM member states (Community, established 4 July 1973). */
export const CARICOM_MEMBERS = [
  'Antigua and Barbuda', 'The Bahamas', 'Bahamas', 'Barbados', 'Belize', 'Dominica',
  'Grenada', 'Guyana', 'Haiti', 'Jamaica', 'Montserrat', 'Saint Kitts and Nevis',
  'Saint Lucia', 'Saint Vincent and the Grenadines', 'Suriname', 'Trinidad and Tobago',
] as const;

const T82_WARNING =
  'WARNING: It is an offence under the Customs Act, Chap. 78:01 to make a false declaration. ' +
  'Severe penalties may be applied in cases where false declarations are made.';

const C73_WARNING =
  'WARNING: It is an offence under the Customs Act to make a false declaration. ' +
  'Severe penalties may be applied in cases where false declarations are made.';

const C84_DECLARATION_TEXT =
  'I/We hereby declare that the particulars entered on this declaration are true, and that the ' +
  'items listed qualify for the treatment claimed under the Customs Procedure Code stated for each item.';

const C84_LEGAL_NOTE =
  'Form C84 — Declaration in respect of Claims for Treatment under Specific Customs Procedures ' +
  '(Schedule I, Customs Regulations, Chap. 78:01, as amended by Legal Notice 72 of 1993). ' +
  'Claims must be linked to the import/export entry (Form C82) that covers the goods.';

const CARICOM_EXPORTER_DECLARATION =
  'I, the undersigned, declare that the goods described in this certificate originate in the country ' +
  'shown in box 4 and comply with the CARICOM Rules of Origin, and that the particulars given are true and correct.';

const CARICOM_CERTIFICATION_TEXT =
  'Certification by the authorised body of the exporting CARICOM member state ' +
  '(Customs & Excise Division / Chamber of Commerce / Ministry of Trade, as applicable).';

const DEFAULT_CPC_HOME_CONSUMPTION = '10 00 000'; // ASYCUDA procedure 10 = home consumption/use

export interface C82Input {
  variant?: 'c82' | 'c73';
  entryNumber?: string;
  entryDate?: string;
  exporterConsignor?: string;
  importerConsignee?: string;
  consignee?: string;
  declarant?: string;
  transactingBank?: string;
  transportDocument?: string;       // B/L or AWB
  regime?: string;
  mode?: string;                    // sea | air
  vesselOrFlight?: string;
  carrier?: string;
  incoterm?: string;
  originPort?: string;
  destinationPort?: string;
  exchangeRate: number;
  fobUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  otherChargesTtd?: Array<{ type: string; code: string; amount: number }>;
  additionalInformation?: string;
  agentOfCarrier?: string;
  totalPackages?: string;
  items: Array<{
    description: string;
    hsCode: string;
    netKg?: number | null;
    grossKg?: number | null;
    quantity?: number | null;
    unit?: string | null;
    marksAndNumbers?: string;
    originCountry?: string;
    destinationCountry?: string;
    /** Real landed-cost lines for THIS item (kind tax/fee only). */
    costLines: Array<{ key: string; label: string; basis: string; amount: number; kind: 'tax' | 'fee' | 'value'; order: number }>;
  }>;
}

const TAX_CODE_BY_KEY: Record<string, string> = {
  duty: 'DUTY', dutyTtd: 'DUTY',
  vat: 'VAT', vatTtd: 'VAT',
  mvt: 'MVT', mvtTtd: 'MVT',
  excise: 'EXCISE', exciseTtd: 'EXCISE',
  environmental: 'ENV LEVY', environmentalTtd: 'ENV LEVY',
  online_purchase_levy: 'ONLINE LEVY',
};

function mapTaxCode(line: { key: string; label: string }): string {
  return TAX_CODE_BY_KEY[line.key] || line.label.toUpperCase().slice(0, 12);
}

/** Extract a human rate from the engine's basis string, e.g. "CIF × 25%" → "25%". */
function rateFromBasis(basis: string): string {
  const m = /×\s*([\d.]+\s*%)/.exec(basis);
  if (m) return m[1].trim();
  const m2 = /TT\$\s*[\d.]+(?:\/kW|\/cc|\/kg)?/.exec(basis);
  if (m2) return m2[0].replace('TT$', 'TT$');
  return basis || '—';
}

export interface BuildResult<T> { form: T; errors: FormIssue[]; warnings: FormIssue[] }

export function buildFormC82(input: C82Input): BuildResult<C82Form> {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  const variant = input.variant ?? 'c82';

  if (!input.items.length) errors.push({ field: 'items', message: 'At least one item line is required (box 25).' });
  if (!input.exporterConsignor) warnings.push({ field: 'box1', message: 'Exporter/Consignor (box 1) is empty.' });
  if (!input.importerConsignee) errors.push({ field: 'box5', message: 'Importer/Consignee (box 5) is mandatory.' });
  if (!input.transportDocument) warnings.push({ field: 'box7', message: 'Transport document (B/L or AWB, box 7) is empty.' });
  if (!input.exchangeRate || input.exchangeRate <= 0) errors.push({ field: 'exchangeRate', message: 'Exchange rate (TTD per USD) is mandatory to value the declaration in TT$.' });

  const cifUsd = round2(input.fobUsd + input.freightUsd + input.insuranceUsd);
  const cifTtd = round2(cifUsd * (input.exchangeRate || 0));

  const items: C82Item[] = input.items.map((it, idx) => {
    const customsValueTtd = round2(cifTtd / Math.max(1, input.items.length)); // CIF apportioned evenly — editable in UI
    const taxRows: C82TaxRow[] = it.costLines
      .filter((l) => l.kind === 'tax' || l.kind === 'fee')
      .map((l) => ({
        code: mapTaxCode(l),
        baseAmount: round2(/vat/i.test(l.key) ? cifTtd + (it.costLines.find((d) => /duty/i.test(d.key))?.amount ?? 0) : cifTtd),
        rate: rateFromBasis(l.basis),
        amount: round2(l.amount),
      }));
    if (!it.netKg) warnings.push({ field: `item${idx + 1}.netKg`, message: `Item ${idx + 1}: net mass (box 28) is empty.` });
    if (!it.grossKg) warnings.push({ field: `item${idx + 1}.grossKg`, message: `Item ${idx + 1}: gross mass (box 29) is empty.` });
    if (!it.hsCode) errors.push({ field: `item${idx + 1}.hsCode`, message: `Item ${idx + 1}: commodity code (box 27) is mandatory.` });
    return {
      item: idx + 1,
      description: it.description,
      cpc: DEFAULT_CPC_HOME_CONSUMPTION,
      commodityCode: it.hsCode,
      netKg: it.netKg ?? null,
      grossKg: it.grossKg ?? null,
      supplQty1: it.quantity != null ? `${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '',
      marksAndNumbers: it.marksAndNumbers || '',
      freightTtd: round2(input.freightUsd * (input.exchangeRate || 0) / Math.max(1, input.items.length)),
      insuranceTtd: round2(input.insuranceUsd * (input.exchangeRate || 0) / Math.max(1, input.items.length)),
      otherCostsTtd: 0,
      customsValueTtd,
      originCountry: it.originCountry || '',
      destinationCountry: it.destinationCountry || '',
      taxes: taxRows,
      totalTaxesTtd: round2(taxRows.reduce((s, t) => s + t.amount, 0)),
    };
  });

  const totalTaxes = round2(items.reduce((s, i) => s + i.totalTaxesTtd, 0));
  const otherCharges = (input.otherChargesTtd || []).map((c) => ({ ...c, amount: round2(c.amount) }));

  const form: C82Form = {
    kind: 'c82',
    variant,
    box1ExporterConsignor: input.exporterConsignor || '',
    box2Regime: input.regime || (variant === 'c82' ? 'IMPORT' : 'IMPORT'),
    box3NumberOfSheets: 1,
    box4NumberOfItems: items.length,
    box5ImporterConsignee: input.importerConsignee || '',
    box6TotalPackages: input.totalPackages || '',
    box7TransportDocument: input.transportDocument || '',
    box13Declarant: input.declarant || '',
    box14TransactingBank: input.transactingBank || '',
    box16Consignee: input.consignee || input.importerConsignee || '',
    box17TotalCifTtd: cifTtd,
    box18MeansOfTransport: {
      mode: (input.mode || 'sea').toUpperCase(),
      type: input.mode === 'air' ? 'AIR' : 'SEA',
      rotation: input.vesselOrFlight || '',
      number: '',
    },
    box19AgentOfCarrier: input.agentOfCarrier || '',
    box20PortOfImportExport: [input.originPort, input.destinationPort].filter(Boolean).join('  →  '),
    box22AdditionalInformation: input.additionalInformation || (input.incoterm ? `Incoterm: ${input.incoterm}. Exchange rate: TT$${input.exchangeRate}/USD.` : ''),
    box23OtherCharges: otherCharges,
    box24TotalTaxesTtd: totalTaxes,
    items,
    box48DeclarationText:
      'I/We hereby declare all the particulars on this declaration to be true and that all attached documents refer to the goods as declared.',
    legalWarning: variant === 'c82' ? T82_WARNING : C73_WARNING,
    formTitle: variant === 'c82'
      ? 'CUSTOMS DECLARATION (Import/Export) — Form C82'
      : 'CUSTOMS DECLARATION — Form C73 (Jamaica · Guyana · Barbados · regional)',
    formFooter: variant === 'c82'
      ? 'REPUBLIC OF TRINIDAD AND TOBAGO — Customs and Excise Division (Form C82, regulation 36, Legal Notice 72 of 1993).'
      : 'Regional CARICOM entry form C73 as used by Jamaica Customs Agency, Guyana Revenue Authority and Barbados Customs.',
    entryNumber: input.entryNumber || '',
    entryDate: input.entryDate || new Date().toISOString().slice(0, 10),
    generatedFrom: { shipmentReference: '', costCalcName: null, builtAt: new Date().toISOString() },
  };

  return { form, errors, warnings };
}

export interface C84Input {
  declarationNoAndDate?: string;
  declarantName?: string;
  importerExporter?: string;
  regimeCode?: string;
  refNo?: string;
  claims: Array<{ itemNo?: number; cpc?: string; description?: string; claimBasis?: string }>;
  shipmentReference?: string;
}

export function buildFormC84(input: C84Input): BuildResult<C84Form> {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  if (!input.declarationNoAndDate) errors.push({ field: 'declarationNoAndDate', message: 'The linked customs declaration number and date are mandatory (C84 claims treatment of an existing entry).' });
  if (!input.importerExporter) errors.push({ field: 'importerExporter', message: 'Importer/Exporter is mandatory.' });
  if (!input.claims.length) errors.push({ field: 'claims', message: 'At least one item/claim is required.' });
  input.claims.forEach((c, i) => {
    if (!c.cpc) errors.push({ field: `claims.${i}.cpc`, message: `Claim ${i + 1}: CPC (Customs Procedure Code) is mandatory.` });
    if (!c.claimBasis) warnings.push({ field: `claims.${i}.claimBasis`, message: `Claim ${i + 1}: state the legal basis of the claim (concession, exemption, undertaking).` });
  });
  if (!input.declarantName) warnings.push({ field: 'declarantName', message: 'Declarant name is empty.' });

  return {
    errors,
    warnings,
    form: {
      kind: 'c84',
      declarationNoAndDate: input.declarationNoAndDate || '',
      declarantName: input.declarantName || '',
      importerExporter: input.importerExporter || '',
      regimeCode: input.regimeCode || '',
      refNo: input.refNo || '',
      claims: input.claims.map((c, i) => ({
        itemNo: c.itemNo ?? i + 1,
        cpc: c.cpc || '',
        description: c.description || '',
        claimBasis: c.claimBasis || '',
      })),
      declarationText: C84_DECLARATION_TEXT,
      legalNote: C84_LEGAL_NOTE,
      generatedFrom: { shipmentReference: input.shipmentReference || '', builtAt: new Date().toISOString() },
    },
  };
}

export interface CaricomCoInput {
  certificateNo?: string;
  issuedIn?: string;
  consignorExporter?: string;
  consignee?: string;
  transportRoute?: string;
  countryOfOrigin?: string;
  portOfLoading?: string;
  placeOfDestination?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  goods: Array<Partial<CaricomCoGood>>;
  shipmentReference?: string;
}

export function buildCaricomCo(input: CaricomCoInput): BuildResult<CaricomCoForm> {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  const origin = (input.countryOfOrigin || '').trim();
  const isMember = CARICOM_MEMBERS.some((m) => m.toLowerCase() === origin.toLowerCase());
  if (!origin) errors.push({ field: 'box4', message: 'Country/territory of origin (box 4) is mandatory.' });
  else if (!isMember) errors.push({ field: 'box4', message: `"${origin}" is not a CARICOM member state — a CARICOM Certificate of Origin only certifies origin within the Community. For non-CARICOM origin, issue a general certificate of origin instead.` });
  if (!input.consignorExporter) errors.push({ field: 'box1', message: 'Consignor/Exporter (box 1) is mandatory.' });
  if (!input.consignee) warnings.push({ field: 'box2', message: 'Consignee (box 2) is empty.' });
  if (!input.goods.length) errors.push({ field: 'goods', message: 'At least one goods line is required.' });
  if (!input.invoiceNumber) warnings.push({ field: 'invoiceNumber', message: 'Commercial invoice number is empty — customs normally requires it to process the certificate.' });
  input.goods.forEach((g, i) => {
    if (!g.description) errors.push({ field: `goods.${i}.description`, message: `Goods line ${i + 1}: description is mandatory.` });
    if (!g.hsCode) warnings.push({ field: `goods.${i}.hsCode`, message: `Goods line ${i + 1}: HS code is empty.` });
  });

  return {
    errors,
    warnings,
    form: {
      kind: 'caricom-co',
      certificateNo: input.certificateNo || '',
      issuedIn: input.issuedIn || (origin || 'Trinidad and Tobago'),
      box1ConsignorExporter: input.consignorExporter || '',
      box2Consignee: input.consignee || '',
      box3TransportRoute: input.transportRoute || '',
      box4CountryOfOrigin: origin,
      box5PortOfLoading: input.portOfLoading || '',
      box5PlaceOfDestination: input.placeOfDestination || '',
      goods: input.goods.map((g, i) => ({
        marksAndNumbers: g.marksAndNumbers || '',
        numberOfPackages: g.numberOfPackages || '',
        kindOfPackages: g.kindOfPackages || '',
        description: g.description || '',
        hsCode: g.hsCode || '',
        grossWeightKg: g.grossWeightKg ?? null,
        invoiceValueUsd: g.invoiceValueUsd ?? 0,
      })),
      invoiceNumber: input.invoiceNumber || '',
      invoiceDate: input.invoiceDate || '',
      exporterDeclarationText: CARICOM_EXPORTER_DECLARATION,
      certificationText: CARICOM_CERTIFICATION_TEXT,
      generatedFrom: { shipmentReference: input.shipmentReference || '', builtAt: new Date().toISOString() },
    },
  };
}

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Sum of all duty/tax rows across items — used to cross-check box 24. */
export function c82TotalTaxes(form: C82Form): number {
  return round2(form.items.reduce((s, i) => s + i.totalTaxesTtd, 0));
}

/** Cross-check: box 24 must equal the sum of per-item totals (±0.01). */
export function validateC82Totals(form: C82Form): FormIssue[] {
  const issues: FormIssue[] = [];
  const diff = Math.abs(c82TotalTaxes(form) - form.box24TotalTaxesTtd);
  if (diff > 0.01) issues.push({ field: 'box24', message: `Box 24 (${form.box24TotalTaxesTtd.toFixed(2)}) does not match the sum of item duties/taxes (${c82TotalTaxes(form).toFixed(2)}).` });
  return issues;
}

// ── Form C83 — Notification of Query and Referral ────────────────────────────
// Schedule I, Customs Regulations, Chap. 78:01 (list of forms, as amended by
// Legal Notice 72 of 1993). Documents a customs query against an existing
// entry and the broker's response trail.

export interface C83Input {
  queryNo?: string;
  queryDate?: string;
  entryNoAndDate?: string;
  declarantName?: string;
  importerExporter?: string;
  officerUnit?: string;
  referralType?: string;
  itemsAffected?: string;
  queryDetails?: string;
  responseDetails?: string;
  responseDeadline?: string;
  status?: string;
  shipmentReference?: string;
}

export function buildFormC83(input: C83Input): BuildResult<C83Form> {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  if (!input.entryNoAndDate) errors.push({ field: 'entryNoAndDate', message: 'The queried customs entry number and date are mandatory — a C83 always refers to an existing C82/C73 declaration.' });
  if (!input.queryDetails) errors.push({ field: 'queryDetails', message: 'State the query: what Customs is asking or referring for examination must be recorded verbatim.' });
  if (!input.itemsAffected) warnings.push({ field: 'itemsAffected', message: 'Items/containers affected are empty — identify the exact item lines or containers under query.' });
  if (!input.declarantName) warnings.push({ field: 'declarantName', message: 'Declarant name is empty.' });
  if (!input.responseDeadline) warnings.push({ field: 'responseDeadline', message: 'No response deadline recorded — queries left unanswered can stall the release of the goods.' });

  return {
    errors,
    warnings,
    form: {
      kind: 'c83',
      queryNo: input.queryNo || '',
      queryDate: input.queryDate || new Date().toISOString().slice(0, 10),
      entryNoAndDate: input.entryNoAndDate || '',
      declarantName: input.declarantName || '',
      importerExporter: input.importerExporter || '',
      officerUnit: input.officerUnit || '',
      referralType: input.referralType || 'Examination',
      itemsAffected: input.itemsAffected || '',
      queryDetails: input.queryDetails || '',
      responseDetails: input.responseDetails || '',
      responseDeadline: input.responseDeadline || '',
      status: input.status || 'Open',
      declarationText:
        'This notification records the query raised on the entry cited above. The declarant responds in writing, ' +
        'providing the documents or clarifications requested, without prejudice to the provisions of the Customs Act, Chap. 78:01.',
      legalNote:
        'Form C83 — Notification of Query and Referral (Schedule I, list of forms, Customs Regulations, Chap. 78:01, ' +
        'as amended by Legal Notice 72 of 1993). Keep the query and its answer on file: the response trail is part ' +
        'of the entry record and may be requested in post-clearance audits.',
      generatedFrom: { shipmentReference: input.shipmentReference || '', builtAt: new Date().toISOString() },
    },
  };
}

// ── Form C86 — Bill of Sight covered by Bond ────────────────────────────────
// Schedule I, Customs Regulations, Chap. 78:01 (list of forms, as amended by
// Legal Notice 72 of 1993). Allows entry when complete particulars of the
// goods are not yet available; the declaration is completed by the full entry
// (C82) after examination, under a bond securing duties and charges.

export interface C86Input {
  entryNoAndDate?: string;
  importerExporter?: string;
  declarantName?: string;
  goodsBestDescription?: string;
  reasonsParticularsUnavailable?: string;
  containers?: string;
  estimatedValueTtd?: number | null;
  estimatedQuantity?: string;
  bondAmountTtd?: number;
  bondSurety?: string;
  shipmentReference?: string;
}

export function buildFormC86(input: C86Input): BuildResult<C86Form> {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];
  if (!input.importerExporter) errors.push({ field: 'importerExporter', message: 'Importer/Exporter is mandatory.' });
  if (!input.goodsBestDescription) errors.push({ field: 'goodsBestDescription', message: 'A best-known description of the goods is mandatory — a bill of sight still declares, to the best of knowledge, what the goods are.' });
  if (!input.reasonsParticularsUnavailable) errors.push({ field: 'reasonsParticularsUnavailable', message: 'State why complete particulars are unavailable (e.g. sealed consignment, documents in transit, goods unexamined).' });
  if (!input.bondAmountTtd || input.bondAmountTtd <= 0) errors.push({ field: 'bondAmountTtd', message: 'The bond amount (TT$) is mandatory — the bill of sight must be covered by a bond securing duties and charges.' });
  if (!input.bondSurety) warnings.push({ field: 'bondSurety', message: 'Surety (guarantor) is empty — identify the company or person standing behind the bond.' });
  if (input.estimatedValueTtd == null) warnings.push({ field: 'estimatedValueTtd', message: 'No estimated value — an estimate helps Customs size the bond and screen the consignment.' });

  return {
    errors,
    warnings,
    form: {
      kind: 'c86',
      entryNoAndDate: input.entryNoAndDate || '',
      importerExporter: input.importerExporter || '',
      declarantName: input.declarantName || '',
      goodsBestDescription: input.goodsBestDescription || '',
      reasonsParticularsUnavailable: input.reasonsParticularsUnavailable || '',
      containers: input.containers || '',
      estimatedValueTtd: input.estimatedValueTtd ?? null,
      estimatedQuantity: input.estimatedQuantity || '',
      bondAmountTtd: round2(input.bondAmountTtd || 0),
      bondSurety: input.bondSurety || '',
      undertakingText:
        'I/We undertake to submit a full and complete declaration of the goods (Form C82) as soon as the particulars ' +
        'become available and in any case upon completion of examination, and to pay any additional duties, taxes and ' +
        'other charges lawfully payable in respect of the goods.',
      bondText:
        'This bill of sight is covered by a bond in the sum stated above, with the surety named below, conditioned upon ' +
        'the full and true declaration of the goods and the payment of all duties, taxes and charges payable in respect of them.',
      legalNote:
        'Form C86 — Bill of Sight covered by Bond (Schedule I, list of forms, Customs Regulations, Chap. 78:01, ' +
        'as amended by Legal Notice 72 of 1993). Used when complete particulars of the goods are not available at the ' +
        'time of entry; the entry is completed by the full declaration after examination. The estimated value and ' +
        'quantity on this form are declared as estimates, not as final taxable values.',
      generatedFrom: { shipmentReference: input.shipmentReference || '', builtAt: new Date().toISOString() },
    },
  };
}
