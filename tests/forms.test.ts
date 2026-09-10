/**
 * Forms engine tests — pure functions, no DB.
 * Run: bun tests/forms.test.ts
 */
import {
  buildFormC82, buildFormC84, buildFormC83, buildFormC86, buildCaricomCo, validateC82Totals, c82TotalTaxes,
  CARICOM_MEMBERS, type C82Input,
} from '../src/lib/engine/forms';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

const BASE: C82Input = {
  entryNumber: 'C82-2026-004512',
  exporterConsignor: 'Shanghai Tools Co. Ltd, 88 Industrial Ave, Shanghai, China',
  importerConsignee: 'West Power Distribution Ltd, 12 Sea Lots Road, Port of Spain',
  declarant: 'Clearing Services Ltd (Broker Licence 1234)',
  transactingBank: 'Republic Bank Ltd',
  transportDocument: 'MAEU-223456789',
  mode: 'sea',
  vesselOrFlight: 'MV CARIB SPIRIT V.112W',
  originPort: 'Shanghai, CN',
  destinationPort: 'Port of Spain, TT',
  incoterm: 'CIF',
  exchangeRate: 6.80,
  fobUsd: 50000,
  freightUsd: 2500,
  insuranceUsd: 250,
  items: [
    {
      description: 'Insulated copper cables, 3-core, 2.5mm²',
      hsCode: '8544.49',
      netKg: 1200,
      grossKg: 1350,
      quantity: 40,
      unit: 'drum',
      originCountry: 'CN',
      costLines: [
        { key: 'duty', label: 'Import duty (CET)', basis: 'CIF × 20%', amount: 90800, kind: 'tax', order: 1 },
        { key: 'vat', label: 'VAT 12.5%', basis: '(CIF + duty) × 12.5%', amount: 67562.5, kind: 'tax', order: 2 },
        { key: 'fees', label: 'Customs processing fee', basis: 'fixed', amount: 80, kind: 'fee', order: 3 },
      ],
    },
  ],
};

console.log('— C82 (T&T Legal Notice 72/1993) —');
{
  const { form, errors, warnings } = buildFormC82(BASE);
  ok(form.kind === 'c82', 'kind c82');
  ok(errors.length === 0, `no errors (${errors.length})`);
  ok(warnings.length === 0, `no warnings (${warnings.length})`);
  ok(form.box4NumberOfItems === 1, 'box 4 = 1 item');
  const expectedCif = (50000 + 2500 + 250) * 6.8;
  ok(Math.abs(form.box17TotalCifTtd - expectedCif) < 0.01, `box 17 CIF TT$ = ${form.box17TotalCifTtd} (expected ${expectedCif.toFixed(2)})`);
  ok(form.items[0].commodityCode === '8544.49', 'box 27 commodity code = HS');
  ok(form.items[0].taxes.length === 3, '3 duty/tax rows from real cost lines');
  ok(form.items[0].taxes[0].code === 'DUTY' && form.items[0].taxes[0].rate === '20%', 'tax row 1 = DUTY 20% from basis "CIF × 20%"');
  ok(form.items[0].taxes[1].code === 'VAT', 'tax row 2 = VAT');
  ok(Math.abs(c82TotalTaxes(form) - form.box24TotalTaxesTtd) < 0.01, 'box 24 = sum of item taxes');
  ok(validateC82Totals(form).length === 0, 'totals cross-check passes');
  ok(form.legalWarning.includes('Chap. 78:01'), 'official T&T warning text present');
}

console.log('— C82 validation (real rules, no invention) —');
{
  const bad = buildFormC82({ ...BASE, importerConsignee: '', exchangeRate: 0, items: [{ ...BASE.items[0], hsCode: '', netKg: null }] });
  ok(bad.errors.some((e) => e.field === 'box5'), 'error: importer mandatory');
  ok(bad.errors.some((e) => e.field === 'exchangeRate'), 'error: exchange rate mandatory');
  ok(bad.errors.some((e) => e.message.includes('commodity code')), 'error: HS mandatory');
  ok(bad.warnings.some((w) => w.message.includes('net mass')), 'warning: net mass missing → warning, not fake data');
  const noItems = buildFormC82({ ...BASE, items: [] });
  ok(noItems.errors.some((e) => e.field === 'items'), 'error: at least one item');
}

console.log('— C82 variant C73 (regional) —');
{
  const { form } = buildFormC82({ ...BASE, variant: 'c73', entryNumber: 'JCA-C73-99123' });
  ok(form.variant === 'c73', 'variant c73');
  ok(form.formTitle.includes('Form C73'), 'title references Form C73');
  ok(form.formFooter.includes('Jamaica'), 'footer names regional administrations');
}

console.log('— C84 (claims under specific customs procedures) —');
{
  const good = buildFormC84({
    declarationNoAndDate: 'C82-2026-004512 / 2026-08-12',
    declarantName: 'Clearing Services Ltd',
    importerExporter: 'West Power Distribution Ltd',
    regimeCode: 'IMPORT',
    refNo: 'CC-2026-0007',
    claims: [{ itemNo: 1, cpc: '10 00 000', description: 'Insulated copper cables', claimBasis: 'VAT exemption — energy sector, Notice to Importers #4 of 2012' }],
  });
  ok(good.errors.length === 0, `no errors (${good.errors.length})`);
  ok(good.form.claims[0].claimBasis.includes('Notice to Importers'), 'claim basis preserved verbatim');
  ok(good.form.legalNote.includes('Legal Notice 72 of 1993'), 'legal citation present');

  const bad = buildFormC84({ claims: [] });
  ok(bad.errors.some((e) => e.field === 'declarationNoAndDate'), 'error: must link an existing entry');
  ok(bad.errors.some((e) => e.field === 'claims'), 'error: at least one claim');
  const badCpc = buildFormC84({ declarationNoAndDate: 'X / 2026-01-01', importerExporter: 'Co', claims: [{ cpc: '' }] });
  ok(badCpc.errors.some((e) => e.message.includes('CPC')), 'error: CPC mandatory per claim');
}

console.log('— CARICOM Certificate of Origin —');
{
  const good = buildCaricomCo({
    certificateNo: 'TT/CO/2026/03311',
    issuedIn: 'Trinidad and Tobago',
    consignorExporter: 'Caribbean Foods Ltd, Freeport, Trinidad',
    consignee: 'Supermart Kingston Ltd, Kingston, Jamaica',
    transportRoute: 'Port of Spain → Kingston (sea)',
    countryOfOrigin: 'Trinidad and Tobago',
    portOfLoading: 'Port of Spain',
    placeOfDestination: 'Kingston, Jamaica',
    invoiceNumber: 'INV-2026-0771',
    invoiceDate: '2026-08-01',
    goods: [{ description: 'Pepper sauce, bottled', hsCode: '2103.90', grossWeightKg: 850, invoiceValueUsd: 4200, numberOfPackages: '85', kindOfPackages: 'cartons' }],
  });
  ok(good.errors.length === 0, `member origin accepted (${good.errors.length})`);
  ok(good.form.exporterDeclarationText.includes('CARICOM Rules of Origin'), 'exporter declaration text present');
  ok(good.form.certificationText.includes('authorised body'), 'certification block present');

  const nonMember = buildCaricomCo({ countryOfOrigin: 'China', goods: [{ description: 'X' }] });
  ok(nonMember.errors.some((e) => e.message.includes('not a CARICOM member')), 'non-member origin REJECTED with guidance');
  ok(CARICOM_MEMBERS.includes('Trinidad and Tobago') && CARICOM_MEMBERS.includes('Haiti'), 'member list includes TT and Haiti (15 members)');
  ok(CARICOM_MEMBERS.length === 16, `list has 16 entries (15 members, Bahamas appears twice as alias) — got ${CARICOM_MEMBERS.length}`);
}

console.log('— C83 (Notification of Query and Referral) —');
{
  const good = buildFormC83({
    queryNo: 'QRY-2026-1188',
    entryNoAndDate: 'C82-2026-004512 / 2026-08-12',
    declarantName: 'Clearing Services Ltd',
    importerExporter: 'West Power Distribution Ltd',
    officerUnit: 'Examination Bay 3 — Port of Spain',
    referralType: 'Valuation',
    itemsAffected: 'Item 1 — container MSCU-123456-7',
    queryDetails: 'Customs queries the declared unit value of item 1 against contemporaneous imports of comparable cables. Submit supplier contract and payment proof.',
    responseDetails: 'Submitted supplier contract, pro-forma and TT$ payment confirmation (Bank Ltd).',
    responseDeadline: '2026-08-26',
    shipmentReference: 'CC-2026-0007',
  });
  ok(good.errors.length === 0, `valid C83 accepted (${good.errors.length})`);
  ok(good.form.kind === 'c83', 'kind c83');
  ok(good.form.legalNote.includes('Legal Notice 72 of 1993'), 'official citation present');
  ok(good.form.status === 'Open', 'status defaults to Open');

  const bad = buildFormC83({});
  ok(bad.errors.some((e) => e.field === 'entryNoAndDate'), 'error: C83 must link an existing entry');
  ok(bad.errors.some((e) => e.field === 'queryDetails'), 'error: query must be stated');
  ok(bad.warnings.some((w) => w.field === 'responseDeadline'), 'warning: no deadline recorded');
}

console.log('— C86 (Bill of Sight covered by Bond) —');
{
  const good = buildFormC86({
    entryNoAndDate: 'BOS-2026-000211 / 2026-09-01',
    importerExporter: 'Atlantic Hardware Ltd, Point Lisas',
    declarantName: 'Clearing Services Ltd',
    goodsBestDescription: 'One sealed 40ft container said to contain power tools and hand tools (invoice still in transit).',
    reasonsParticularsUnavailable: 'Commercial invoice and packing list delayed in transit; container arrived unmanifested in detail.',
    containers: '1 container(s) — 40ft',
    estimatedValueTtd: 180000,
    estimatedQuantity: 'approx. 900 cartons',
    bondAmountTtd: 250000,
    bondSurety: 'Guardian General Brokerage Ltd',
    shipmentReference: 'CC-2026-0031',
  });
  ok(good.errors.length === 0, `valid C86 accepted (${good.errors.length})`);
  ok(good.form.kind === 'c86', 'kind c86');
  ok(good.form.undertakingText.includes('Form C82'), 'undertaking commits to the full C82 declaration');
  ok(good.form.bondText.includes('bond in the sum stated above'), 'bond condition text present');
  ok(good.form.legalNote.includes('Bill of Sight covered by Bond'), 'official form name cited');
  ok(good.form.bondAmountTtd === 250000, 'bond amount preserved');

  const bad = buildFormC86({ bondAmountTtd: 0 });
  ok(bad.errors.some((e) => e.field === 'importerExporter'), 'error: importer mandatory');
  ok(bad.errors.some((e) => e.field === 'goodsBestDescription'), 'error: best-known description mandatory');
  ok(bad.errors.some((e) => e.field === 'reasonsParticularsUnavailable'), 'error: reasons mandatory');
  ok(bad.errors.some((e) => e.field === 'bondAmountTtd'), 'error: bond > 0 mandatory');
  ok(bad.warnings.some((w) => w.field === 'estimatedValueTtd'), 'warning: no estimated value');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
