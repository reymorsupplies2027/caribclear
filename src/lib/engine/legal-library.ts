/**
 * CaribClear — Legal Library (Libro de leyes).
 *
 * A consultable index of the instruments that govern the broker's daily work,
 * with the practical effect of each one and where to verify the official text.
 *
 * SOURCING RULES (enforced):
 *  - Every citation here is either (a) already cited by the tested landed-cost
 *    engine / forms engine, or (b) verified against official T&T / CARICOM
 *    government sources (laws.gov.tt, customs.gov.tt, tradeind.gov.tt,
 *    ttbizlink.gov.tt, finance.gov.tt, ttparliament.org).
 *  - Section numbers are ONLY included where verified (e.g. s.45A Customs Act).
 *  - This is a research aid for operators, NOT the law itself and NOT legal
 *    advice: the authoritative text is the official gazette (laws.gov.tt).
 */

export type LegalCategory = 'act' | 'regulation' | 'legal-notice' | 'budget' | 'caricom' | 'permits';

export interface LegalEntry {
  id: string;
  category: LegalCategory;
  title: string;
  citation: string;
  jurisdiction: 'Trinidad & Tobago' | 'CARICOM';
  whatItGoverns: string;
  keyPoints: string[];
  officialSource: { label: string; url: string };
  /** Where this instrument bites inside CaribClear. */
  relatedFeature?: { label: string; href: string };
}

export const CATEGORY_LABELS: Record<LegalCategory, string> = {
  act: 'Acts (Chapters)',
  regulation: 'Subsidiary regulations',
  'legal-notice': 'Legal notices & orders',
  budget: 'Budget measures',
  caricom: 'CARICOM instruments',
  permits: 'Permits & import controls',
};

export const LEGAL_LIBRARY: LegalEntry[] = [
  {
    id: 'customs-act',
    category: 'act',
    title: 'Customs Act',
    citation: 'Chap. 78:01 — Laws of Trinidad and Tobago',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The backbone of customs practice in T&T: entry and declaration of goods, valuation, examination, warehousing, ' +
      'duty payment and recovery, offences and penalties. Every declaration the broker lodges is made under this Act, ' +
      'and the false-declaration warning printed on Form C82 cites it.',
    keyPoints: [
      'Section 45A — relief for returning nationals (one vehicle, ≥5 years abroad, 2-year transfer clawback).',
      'It is an offence to make a false declaration — the warning text on the C82 comes from the Act.',
      'Record-keeping obligations support the retention policy configured per tenant in CaribClear.',
      'Post-clearance audits draw on the entry file: keep queries (C83) and amendments documented.',
    ],
    officialSource: { label: 'laws.gov.tt — Revised Laws of T&T', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Cost engine', href: '/dashboard/calculator' },
  },
  {
    id: 'customs-regulations',
    category: 'regulation',
    title: 'Customs Regulations — Schedule I (list of forms)',
    citation: 'Subsidiary legislation of the Customs Act, Chap. 78:01',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The official forms used at the border. The Schedule I list includes Form C82 (Customs Declaration), ' +
      'C83 (Notification of Query and Referral), C84 (Claims for Treatment under Specific Customs Procedures), ' +
      'C85 (Statement of Warehouse Rent), C86 (Bill of Sight covered by Bond) and C87 (Cargo Delivery Note).',
    keyPoints: [
      'Form C82 is the current T&T goods declaration (older C73/C74/C77/C78 were repealed from the Schedule by L.N. 72/1993).',
      'Form C86 allows entry when complete particulars are unavailable, covered by a bond securing duties and charges.',
      'Form C83 documents the query-and-response trail on an existing entry — keep it for post-clearance audits.',
    ],
    officialSource: { label: 'tradeind.gov.tt — Customs Chap. 78:01 subsidiary legislation', url: 'https://tradeind.gov.tt/' },
    relatedFeature: { label: 'Forms studio', href: '/dashboard/forms' },
  },
  {
    id: 'ln72-1993',
    category: 'legal-notice',
    title: 'Legal Notice No. 72 of 1993 — Customs (Amendment) Regulations 1993',
    citation: 'L.N. 72 of 1993, 10 May 1993',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The amendment that shaped the modern Schedule I form set: it substituted the C82 as the goods declaration, ' +
      'kept the C84 for special-procedure claims and inserted forms including the C85 (warehouse rent statement) and ' +
      'C86 (Bill of Sight covered by Bond) into the list.',
    keyPoints: [
      'Every form CaribClear builds cites this notice in its footer, as the printed originals do.',
      'If Customs prescribes a revised form layout, record it in Settings → Rate configuration notes and update the form draft in Forms studio.',
    ],
    officialSource: { label: 'laws.gov.tt — Legal notices 1993', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Forms studio', href: '/dashboard/forms' },
  },
  {
    id: 'customs-brokers-act',
    category: 'act',
    title: 'Customs Brokers and Customs Clerks Act',
    citation: 'Chap. 78:03 — Laws of Trinidad and Tobago',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'Licensing and conduct of customs brokers and clerks — who may transact customs business, licence classes and ' +
      'discipline. It is why CaribClear is positioned as a tool for licensed brokers: the platform prepares and organises, ' +
      'the licensed broker of record lodges.',
    keyPoints: [
      'Licence status of the broker of record is not replaced by software — the disclaimer on every calculation restates this.',
      'Broker licence details belong on declarations (declarant box) — keep them current in your company profile.',
    ],
    officialSource: { label: 'TTBizLink — legal reference documents', url: 'https://info.ttbizlink.gov.tt/' },
  },
  {
    id: 'vat-act',
    category: 'act',
    title: 'Value Added Tax Act',
    citation: 'Chap. 75:06',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'VAT at the border: the standard rate (12.5%) and the Second Schedule exemptions the engine applies ' +
      '(including items 8(2), 8(4) and 43 relied on for vehicle and energy-sector exemptions). The VAT line of every ' +
      'landed-cost calculation is (CIF + duty [+ MVT where applicable]) × rate unless the item is exempt.',
    keyPoints: [
      'Standard rate 12.5% — in force since February 2016, editable in Rate configuration if the law ever changes.',
      'Exempt goods: the HS tariff table carries the vatExempt flag per code.',
      'VAT base for vehicles includes duty and (where charged) MVT — the engine builds it line by line.',
    ],
    officialSource: { label: 'laws.gov.tt — Revised Laws of T&T', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Cost engine', href: '/dashboard/calculator' },
  },
  {
    id: 'mvrta',
    category: 'act',
    title: 'Motor Vehicles and Road Traffic Act — MVT schedule',
    citation: 'Chap. 48:50, Fourth Schedule Appendix A',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The Motor Vehicle Tax: charged per engine cc (private cars, Appendix A Part I item 1), with the foreign-used ' +
      'factor (item 6), EV per-kW charges (Part IA item 8), CNG and hybrid items (items 10/11) and the paragraphs ' +
      'governing commercial hybrids (paras 8-10).',
    keyPoints: [
      'MVT base: engine cc × TT$/cc rate — reduced by the foreign-used factor for non-returning nationals.',
      'EVs pay per motor kW (new TT$4 / used TT$3) when above the concession ceiling.',
      'Returning nationals currently pay full MVT (relief revoked 4 Aug 2026).',
    ],
    officialSource: { label: 'laws.gov.tt — Revised Laws of T&T', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Cost engine (vehicle mode)', href: '/dashboard/calculator' },
  },
  {
    id: 'ln247-2024',
    category: 'legal-notice',
    title: 'Hybrid vehicle concession',
    citation: 'L.N. 247 of 2024, cls. 2-3; Appendix A item 11',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The all-or-nothing hybrid concession: private hybrids qualify only up to 1,599cc and 105kW motor power, ' +
      'with used hybrids limited to 3 years of age; qualifying vehicles pay reduced MVT (TT$4/cc new, TT$3/cc used).',
    keyPoints: [
      'Over 1,599cc OR over 105kW OR older than 3 years (used) → no hybrid concession, standard treatment.',
      'The engine rejects partial application — it is all or nothing by law.',
    ],
    officialSource: { label: 'laws.gov.tt — Legal notices', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Cost engine (vehicle mode)', href: '/dashboard/calculator' },
  },
  {
    id: 'ln479-2025',
    category: 'legal-notice',
    title: 'EV & CNG concessions amendment',
    citation: 'L.N. 479 of 2025, cls. 4A/4B',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'Refines the EV concession scope (new, or used ≤2 years, with the TT$400k CIF ceiling and 10% duty above it) ' +
      'and the commercial CNG duty exemption (≤1,599cc).',
    keyPoints: [
      'EV above the ceiling: standard MVT per kW applies and duty becomes 10%.',
      'Commercial CNG ≤1,599cc: customs duty exempt — the engine zeroes the duty line.',
    ],
    officialSource: { label: 'laws.gov.tt — Legal notices', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Cost engine (vehicle mode)', href: '/dashboard/calculator' },
  },
  {
    id: 'ln613-2026',
    category: 'legal-notice',
    title: 'EV/CNG amendments in force 4 Aug 2026',
    citation: 'L.N. 613 of 2026',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The August 2026 changes embedded in engine v3: CNG used-vehicle age limit extended 3→8 years, EV concession ' +
      'mechanics aligned with the FY2026 budget ceiling, returning-national MVT relief revoked.',
    keyPoints: [
      'Versioned in Rate configuration — new calculations from 4 Aug 2026 use these values.',
      'Historical calculations keep their pre-amendment snapshot.',
    ],
    officialSource: { label: 'laws.gov.tt — Legal notices', url: 'https://laws.gov.tt/' },
    relatedFeature: { label: 'Rate configuration', href: '/dashboard/settings' },
  },
  {
    id: 'budget-fy2026',
    category: 'budget',
    title: 'National Budget FY2026 — customs measures',
    citation: 'Budget statement FY2026 and implementing notices',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'The FY2026 customs package: used-vehicle age limits widened (private 3→6 years, light commercial 7→10 years), ' +
      'returning-national concessions removed, the EV regime over TT$400k CIF, plus the used-vehicle excise brackets ' +
      '(8-10 years: 18%; over 10-20 years: 35%).',
    keyPoints: [
      'Age is measured at importation from year of manufacture — the engine computes it.',
      'Excise applies to foreign-used vehicles by age bracket; the VAT-base treatment is configurable until confirmed.',
    ],
    officialSource: { label: 'Ministry of Finance — T&T', url: 'https://www.finance.gov.tt/' },
    relatedFeature: { label: 'Rate configuration', href: '/dashboard/settings' },
  },
  {
    id: 'caricom-cet',
    category: 'caricom',
    title: 'CARICOM Common External Tariff (CET) & origin rules',
    citation: 'Revised Treaty of Chaguaramas — CET and rules of origin',
    jurisdiction: 'CARICOM',
    whatItGoverns:
      'The common tariff applied by CARICOM member states to third-country goods (the CET rate per HS code lives in ' +
      'the tariff table) and the origin rules behind the CARICOM Certificate of Origin, which lets qualifying regional ' +
      'goods move with preferential treatment.',
    keyPoints: [
      'The CET rate per HS code is tenant-editable data — when the CET is revised, update the tariff table, not the code.',
      'A CARICOM CO may only certify origin within the 15 member states — the forms engine rejects non-member origin.',
      'The certificate accompanies the regional C73-style entries used by Jamaica, Guyana and Barbados.',
    ],
    officialSource: { label: 'CARICOM Secretariat', url: 'https://caricom.org/' },
    relatedFeature: { label: 'Forms studio (CARICOM CO)', href: '/dashboard/forms' },
  },
  {
    id: 'negative-list',
    category: 'permits',
    title: 'Import Negative List & Notice to Importers series',
    citation: 'Trade Ordinance notices (e.g. L.N. 69 of 1999; Notice to Importers series)',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'Which goods need import licences or are prohibited/restricted (absolute and conditional prohibitions, ' +
      'left-hand-drive vehicles under s.45A rules, used tyres, etc.), and the annual provisional tax orders published ' +
      'through Notice to Importers.',
    keyPoints: [
      'CaribClear\u2019s permits matrix maps goods categories to the required permit and issuing agency.',
      'Check the permit state per shipment before lodging — a missing licence stalls the container and accrues demurrage.',
    ],
    officialSource: { label: 'Ministry of Trade and Industry', url: 'https://tradeind.gov.tt/' },
    relatedFeature: { label: 'Permits matrix', href: '/dashboard/permits' },
  },
  {
    id: 'provisional-taxes',
    category: 'legal-notice',
    title: 'Provisional Collection of Taxes Orders',
    citation: 'Notice to Importers series (e.g. No. 26 of 2020 re L.N. 344 of 2020)',
    jurisdiction: 'Trinidad & Tobago',
    whatItGoverns:
      'Budget-day tax changes that take effect immediately under provisional collection, announced to importers ' +
      'through Notice to Importers before the Finance Act is passed. Rates confirmed or amended when the Act is passed.',
    keyPoints: [
      'These are the classic "rate changed overnight" moments — record the new figure in Rate configuration with the notice number.',
      'The audit trail keeps who changed what and when, citing the notice.',
    ],
    officialSource: { label: 'Customs & Excise Division — notices', url: 'https://www.customs.gov.tt/' },
    relatedFeature: { label: 'Rate configuration', href: '/dashboard/settings' },
  },
];

/** Naive but effective client-side filter — same style as the universal search. */
export function filterLegalLibrary(entries: LegalEntry[], query: string, category: LegalCategory | 'all'): LegalEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (category !== 'all' && e.category !== category) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.citation.toLowerCase().includes(q) ||
      e.whatItGoverns.toLowerCase().includes(q) ||
      e.keyPoints.some((k) => k.toLowerCase().includes(q))
    );
  });
}
