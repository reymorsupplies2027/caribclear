/**
 * ASYCUDA World e-filing engine tests — pure functions + registry, no DB.
 * Run: bun tests/asycuda.test.ts
 */
import {
  buildAsycudaDeclaration, generateSadXml, xmlWellFormed, xmlEscape,
  validateAsycudaDeclaration, parseCusres, canTransition, assertTransition,
  MAX_TAX_LINES_PER_ITEM, FILING_STATUSES, type AsycudaBuildInput,
} from '../src/lib/engine/asycuda';
import { CUSTOMS_REGIONS, getRegion, eFilingReadyRegions, modeCodeAtBorder } from '../src/lib/engine/customs-regions';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

const BASE: AsycudaBuildInput = {
  country: 'TT',
  shipmentReference: 'CC-2026-0042',
  office: 'Port of Spain',
  officeOfEntry: 'Port of Spain',
  declarationType: 'IM4',
  consigneeCode: 'TRIN-123-456',
  consigneeNameAddress: 'West Power Distribution Ltd — 12 Sea Lots Road, Port of Spain',
  declarantName: 'Clearing Services Ltd',
  incoterm: 'CIF',
  incotermPlace: 'Shanghai',
  currencyCode: 'USD',
  exchangeRate: 6.80,
  mode: 'sea',
  vesselOrFlight: 'MV CARIB SPIRIT V.112W',
  originPort: 'Shanghai, CN',
  destinationPort: 'Port of Spain, TT',
  totalPackages: '1 container(s) — 40ft',
  transportDocument: 'MAEU-223456789',
  items: [{
    description: 'Insulated copper cables, 3-core',
    hsCode: '8544.49',
    netKg: 1200,
    grossKg: 1350,
    packagesCount: 1,
    kindOfPackages: 'container 40ft',
    containerNumber: 'MAEU1234567',
    originCountry: 'CN',
    quantity: 40,
    unit: 'drum',
    fobLineUsd: 50000,
    costLines: [
      { key: 'duty', label: 'Import duty (CET)', basis: 'CIF × 20%', amount: 90800, kind: 'tax', order: 1 },
      { key: 'vat', label: 'VAT 12.5%', basis: '(CIF + duty) × 12.5%', amount: 68100, kind: 'tax', order: 2 },
      { key: 'fees', label: 'Customs processing fee', basis: 'fixed', amount: 80, kind: 'fee', order: 3 },
    ],
  }],
};

console.log('— Regional registry (verified sources only) —');
{
  ok(CUSTOMS_REGIONS.length >= 12, `registry covers ${CUSTOMS_REGIONS.length} Caribbean ASYCUDA administrations`);
  ok(CUSTOMS_REGIONS.every((r) => ['c82', 'c73'].includes(r.form)), 'every region declares a real form (c82/c73)');
  ok(CUSTOMS_REGIONS.every((r) => r.systemSource.startsWith('http')), 'every systemNote cites an official source');
  ok(CUSTOMS_REGIONS.filter((r) => r.vatVerified).every((r) => r.vatRate != null), 'verified VAT rows always carry a rate');
  const tt = getRegion('TT');
  ok(!!tt && tt.calibration === 'full' && tt.form === 'c82' && tt.cpcFormat === 'tt', 'TT: full calibration, C82, T&T CPC format');
  const jm = getRegion('JM');
  ok(!!jm && jm.form === 'c73' && jm.efilingPortalUrl === 'https://jets.jacustoms.gov.jm' && jm.vatRate === 15 && jm.vatVerified, 'JM: C73, JETS portal, GCT 15% verified');
  ok(getRegion('XX') === null, 'unknown region returns null');
  ok(eFilingReadyRegions().every((r) => r.calibration !== 'struct'), 'eFilingReady excludes struct-only administrations');
  ok(modeCodeAtBorder('sea') === '1' && modeCodeAtBorder('air') === '4' && modeCodeAtBorder('road') === null, 'UN Rec 19 border mode codes: sea=1, air=4');
}

console.log('— Declaration builder (real shipment + cost data) —');
{
  const { declaration, errors, warnings } = buildAsycudaDeclaration(BASE);
  ok(errors.length === 0, `clean build has no errors (${errors.map((e) => e.field).join(', ')})`);
  ok(warnings.length === 0, `clean build has no warnings (${warnings.map((w) => w.field).join(', ')})`);
  ok(declaration.general.boxReferenceNumber === 'CC-2026-0042', 'box 7 = trader reference');
  ok(declaration.general.boxDeclarationType === 'IM4', 'box 1 = IM4');
  ok(declaration.general.boxConsigneeCode === 'TRIN-123-456', 'box 8 code = TIN');
  ok(declaration.general.boxDeclarantName === 'Clearing Services Ltd', 'box 14 = declarant');
  ok(declaration.general.boxDeliveryTermsCode === 'CIF', 'box 20 code = INCOTERMS');
  ok(declaration.general.boxModeTransportBorder === '1', 'box 25 sea = 1');
  ok(declaration.general.boxContainers === true, 'box 19 container flag from real container numbers');
  ok(declaration.items[0].box33CommodityCode === '8544.49', 'box 33 = HS code');
  ok(declaration.items[0].box37Cpc === '10 00 000', 'TT default CPC = 10 00 000 (box 37)');
  ok(declaration.items[0].taxes.length === 3, 'box 47 rows from real cost lines only');
  ok(declaration.totals.totalDutyTaxes === 90800 + 68100 + 80, `totals duty/taxes = ${declaration.totals.totalDutyTaxes}`);
  // statistical value derived from duty: 90800 / 0.20 = 454000 (consistent with VAT branch: 68100/0.125 − 90800 = 454000)
  ok(Math.abs(declaration.items[0].box46StatisticalValue - 454000) < 1, `box 46 statistical value = ${declaration.items[0].box46StatisticalValue}`);
  const vatRow = declaration.items[0].taxes.find((t) => t.taxType === 'VAT');
  ok(!!vatRow && Math.abs(vatRow.taxBase - (454000 + 90800)) < 1, 'VAT base = CIF + duty (box 47 base)');
  ok(declaration.totals.statisticalTotal > 0 && declaration.totals.itemsCount === 1, 'totals consistent');
}
{
  const jm = buildAsycudaDeclaration({ ...BASE, country: 'JM', office: 'Kingston', items: [{ ...BASE.items[0], cpc: undefined }] });
  ok(jm.declaration.items[0].box37Cpc === '1000', 'regional default CPC = 1000 (4 digits)');
  const badCpc = validateAsycudaDeclaration(jm.declaration);
  ok(!badCpc.some((i) => i.field.endsWith('.cpc')), 'CPC 1000 passes the std4 pattern');
}
{
  // Missing mandatory data → errors, never invented values
  const { errors } = buildAsycudaDeclaration({ ...BASE, office: '', exchangeRate: 0, items: [{ description: '', hsCode: '', costLines: [] }] });
  ok(errors.some((e) => e.field === 'boxOffice'), 'error: office mandatory');
  ok(errors.some((e) => e.field === 'boxExchangeRate'), 'error: exchange rate > 0 mandatory');
  ok(errors.some((e) => e.field === 'item1.hsCode'), 'error: HS code mandatory');
  ok(errors.some((e) => e.field === 'item1.description'), 'error: description mandatory');
}
{
  // CARICOM origin → preference + CO warning
  const { declaration, warnings } = buildAsycudaDeclaration({ ...BASE, items: [{ ...BASE.items[0], originCountry: 'Jamaica' }] });
  ok(declaration.items[0].box36PreferenceCode === 'CARICOM', 'CARICOM origin sets preference hint');
  ok(warnings.some((w) => w.message.includes('Certificate of Origin')), 'warning: attach CARICOM CO');
}
{
  // >8 taxes per item → validation error (ASYCUDA box 47 limit)
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `levy${i}`, label: `Levy ${i}`, basis: 'CIF × 1%', amount: 100, kind: 'tax' as const, order: i }));
  const { declaration, errors } = buildAsycudaDeclaration({ ...BASE, items: [{ ...BASE.items[0], costLines: many }] });
  ok(errors.some((e) => e.field === 'item1.taxes' && e.message.includes(String(MAX_TAX_LINES_PER_ITEM))), 'error: more than 8 tax rows rejected');
  ok(declaration.items[0].taxes.length === 9, 'all 9 lines preserved in the model (rejection at validation, not data loss)');
}

console.log('— SAD XML generation —');
{
  const { declaration } = buildAsycudaDeclaration(BASE);
  const xml = generateSadXml(declaration);
  ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML declaration present');
  ok(xml.includes('<GeneralSegment>') && xml.includes('<ItemSegment>') && xml.includes('<CalculationOfTaxes box="47">'), 'SAD general + item + tax segments present');
  ok(xml.includes('box="7"') && xml.includes('box="33"') && xml.includes('box="46"'), 'elements carry their SAD box numbers');
  ok(xmlWellFormed(xml).ok, `XML well-formed (${xmlWellFormed(xml).error || 'ok'})`);
  ok(!/<Description box="31">Insulated copper cables, 3-core &/.test(xml) === false || xml.includes('3-core'), 'description preserved');
}
{
  // escaping: hostile description must not break well-formedness
  const { declaration } = buildAsycudaDeclaration({ ...BASE, items: [{ ...BASE.items[0], description: 'Cables 2.5mm² <heavy duty> & "shielded"', hsCode: '8544.49' }] });
  const xml = generateSadXml(declaration);
  ok(xml.includes('&lt;heavy duty&gt;') && xml.includes('&amp;') && xml.includes('&quot;'), 'XML special chars escaped');
  ok(xmlWellFormed(xml).ok, 'escaped XML still well-formed');
  ok(xmlEscape('a<b>c&"d\'e') === 'a&lt;b&gt;c&amp;&quot;d&apos;e', 'xmlEscape covers all five entities');
}
{
  ok(xmlWellFormed('<?xml version="1.0"?><a><b/></a>').ok, 'well-formed: nested + self-closing');
  ok(!xmlWellFormed('<?xml version="1.0"?><a><b></a></b>').ok, 'rejects mis-nested tags');
  ok(!xmlWellFormed('<?xml version="1.0"?><a><b>').ok, 'rejects unclosed tags');
  ok(!xmlWellFormed('no xml').ok, 'rejects non-XML');
  ok(!xmlWellFormed('<?xml version="1.0"?><a>x & y</a>').ok, 'rejects unescaped ampersand');
}

console.log('— CUSRES (customs response) parsing —');
{
  const sample = `<?xml version="1.0"?>
<Response><DeclarationStatus>REGISTERED</DeclarationStatus>
<RegistrationNumber>C 427</RegistrationNumber><RegistrationDate>2026-08-12</RegistrationDate>
<AssessmentNumber>A-9911</AssessmentNumber><TotalAssessment>158442.50</TotalAssessment></Response>`;
  const r = parseCusres(sample);
  ok(r.recognized, 'CUSRES recognized');
  ok(r.registrationNumber === 'C 427', `registration number = ${r.registrationNumber}`);
  ok(r.registrationDate === '2026-08-12', 'registration date parsed');
  ok(r.assessmentNumber === 'A-9911', 'assessment number parsed');
  ok(r.totalAssessed === 158442.5, `total assessed = ${r.totalAssessed}`);
  ok(r.status === 'registered', `status normalized = ${r.status}`);
}
{
  const alt = '<?xml version="1.0"?><CUSRES><RegNumber>4412</RegNumber><RegDate>12/08/2026</RegDate><ReceiptNo>RC-778</ReceiptNo></CUSRES>';
  const r = parseCusres(alt);
  ok(r.recognized && r.registrationNumber === '4412', 'alternate tag variant parsed (RegNumber)');
  ok(r.registrationDate === '2026-08-12', 'DD/MM/YYYY date normalized to ISO');
  ok(r.receiptNumber === 'RC-778', 'receipt number parsed');
  ok(!parseCusres('<?xml version="1.0"?><Whatever><Foo>bar</Foo></Whatever>').recognized, 'unrelated XML → recognized=false (never guesses)');
}

console.log('— Filing workflow transitions —');
{
  ok(canTransition('xml_generated', 'filed'), 'xml_generated → filed allowed');
  ok(canTransition('filed', 'registered'), 'filed → registered allowed');
  ok(canTransition('registered', 'assessed') && canTransition('assessed', 'cleared'), 'registered → assessed → cleared allowed');
  ok(!canTransition('xml_generated', 'cleared'), 'xml_generated → cleared FORBIDDEN (no shortcuts)');
  ok(!canTransition('cleared', 'draft'), 'cleared is terminal');
  ok(canTransition('rejected', 'draft'), 'rejected can be reopened as draft');
  let threw = false;
  try { assertTransition('draft', 'cleared'); } catch { threw = true; }
  ok(threw, 'assertTransition throws on illegal move');
  ok(FILING_STATUSES.length === 9, '9 statuses modelled');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
