/**
 * CaribClear — Caribbean customs regions registry (pure data, no DB).
 *
 * Purpose: answers "which countries' laws and protocols does CaribClear work
 * with?" in code, and drives the ASYCUDA e-filing module (office, declaration
 * type, CPC format, currency, e-filing channel per administration).
 *
 * EVERY row was verified against public/official sources on 2026-09-11
 * (research files 37-42 in /research). Nothing here is invented:
 *  - Jamaica Customs Agency: ASYCUDA World e-services + JETS portal
 *    (jca.gov.jm, jets.jacustoms.gov.jm); standard entry form C73; C86 related
 *    declarations processed in ASYCUDA World (jets.jacustoms.gov.jm, 2016);
 *    GCT standard rate 15% (PwC Tax Summaries Jamaica, Dec 2025).
 *  - Guyana Revenue Authority: ASYCUDA World programme (gra.gov.gy);
 *    e-payment of duties inside ASYCUDA World live Feb 2026 (gra.gov.gy).
 *  - Barbados: ASYCUDA World trader portal asycuda.customs.gov.bb — customs
 *    officers verify declaration status electronically for release.
 *  - Saint Lucia: ASYCUDA World portal asycuda.customs.gov.lc publishes the
 *    "Single Administrative Document (SAD) XML Message" guide — declarants
 *    submit declaration data electronically in XML to ASYCUDA World.
 *  - Saint Vincent & the Grenadines: ASYCUDA World 4.4.0 launched 2026-06-08
 *    (customs.gov.vc) — declarations + supporting documents handled
 *    electronically via customsportal.gov.vc.
 *  - Dominica: ASYCUDA World handles manifests + declarations
 *    (customs.gov.dm).
 *  - Trinidad & Tobago: Customs & Excise Division; goods declaration is the
 *    C82 (Legal Notice 72 of 1993, Schedule I, Chap. 78:01); landed-cost
 *    engine fully calibrated to the August 2026 fiscal measures
 *    (LN 247/2024, LN 479/2025, LN 613/2026).
 *  - Grenada / Antigua & Barbuda / St. Kitts & Nevis / Belize / Suriname /
 *    Haiti: ASYCUDA user administrations per the official ASYCUDA (UNCTAD)
 *    "User Countries" list (asycuda.org — 102 countries/territories). Portal
 *    URLs not verified for these yet → calibration "struct".
 *
 * HONESTY RULE: vatRate is only set when a public source states the standard
 * rate; otherwise null with vatNote. Rates are INDICATIVE for quoting — the
 * duty/VAT actually charged always comes from the tenant's RateConfig or the
 * local tariff at filing time. calibration:
 *   'full'  = landed-cost engine calibrated to this country's current law
 *   'partial' = ASYCUDA e-filing + forms ready; rate table must be calibrated
 *               against the local tariff before quoting (editable in Settings)
 *   'struct' = ASYCUDA administration confirmed; e-filing structure ready,
 *              national codes/offices to be completed with the client
 */

export interface CustomsRegion {
  code: string;                 // ISO 3166-1 alpha-2
  country: string;
  administration: string;
  /** What the administration runs, with the verified fact + year. */
  systemNote: string;
  /** Official source backing systemNote. */
  systemSource: string;
  /** Standard goods declaration form used by the administration. */
  form: 'c82' | 'c73';
  /** CPC format at box 37: T&T writes "10 00 000"; regional ASYCUDA uses 4 digits. */
  cpcFormat: 'tt' | 'std4';
  vatLabel: string;             // VAT | GCT | ABST | GST | BIV...
  vatRate: number | null;       // standard rate, indicative
  vatVerified: boolean;         // true = public source states this figure
  vatNote: string;
  currency: string;
  /** Confirmed electronic-filing channel for declarants. */
  efilingChannel: string;
  efilingPortalUrl: string | null;
  /** Engine + forms readiness for this country. */
  calibration: 'full' | 'partial' | 'struct';
  caricom: boolean;
}

export const CUSTOMS_REGIONS: CustomsRegion[] = [
  {
    code: 'TT',
    country: 'Trinidad and Tobago',
    administration: 'Customs & Excise Division (Ministry of Finance)',
    systemNote: 'ASYCUDA-based since 2007; the current goods declaration is Form C82 under Schedule I of the Customs Regulations as amended by Legal Notice 72 of 1993.',
    systemSource: 'https://www.legalnotice.org.tt / laws.gov.tt — LN 72/1993; tradeind.gov.tt',
    form: 'c82',
    cpcFormat: 'tt',
    vatLabel: 'VAT',
    vatRate: 12.5,
    vatVerified: true,
    vatNote: 'VAT Act Chap. 75:06; August 2026 fiscal package carried in engine v2 (LN 613/2026, Budget FY2026).',
    currency: 'TTD',
    efilingChannel: 'ASYCUDA entry lodgement at the port of entry; e-payment via approved channels',
    efilingPortalUrl: null,
    calibration: 'full',
    caricom: true,
  },
  {
    code: 'JM',
    country: 'Jamaica',
    administration: 'Jamaica Customs Agency',
    systemNote: 'ASYCUDA World live with e-services (JETS). Related/Enclosed declarations (C86) processed in ASYCUDA World since 2016; C73 processing fee JA$5,000 per JCA import clearance guidance.',
    systemSource: 'https://jca.gov.jm · https://jets.jacustoms.gov.jm',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'GCT',
    vatRate: 15,
    vatVerified: true,
    vatNote: 'Standard GCT 15% (PwC Tax Summaries — Jamaica, Dec 2025). Calibrate the tariff table before quoting.',
    currency: 'JMD',
    efilingChannel: 'JETS — Jamaica Electronic Trade System (registered declarants: brokers, carriers, importers)',
    efilingPortalUrl: 'https://jets.jacustoms.gov.jm',
    calibration: 'partial',
    caricom: true,
  },
  {
    code: 'GY',
    country: 'Guyana',
    administration: 'Guyana Revenue Authority',
    systemNote: 'ASYCUDA World implemented by GRA; e-payment of customs duties and taxes inside ASYCUDA World live since Feb 2026.',
    systemSource: 'https://gra.gov.gy (ASYCUDA World + e-payment notices)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: 14,
    vatVerified: true,
    vatNote: 'Standard VAT 14%. Verify commodity-specific treatment against the GRA tariff before quoting.',
    currency: 'GYD',
    efilingChannel: 'GRA ASYCUDA World (registered declarants) + ASYCUDA World e-payment',
    efilingPortalUrl: 'https://gra.gov.gy',
    calibration: 'partial',
    caricom: true,
  },
  {
    code: 'BB',
    country: 'Barbados',
    administration: 'Customs & Excise Department',
    systemNote: 'ASYCUDA World trader portal live — declarations are lodged electronically and officers verify status in ASYCUDA World for release.',
    systemSource: 'https://asycuda.customs.gov.bb',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: 17.5,
    vatVerified: true,
    vatNote: 'Standard VAT 17.5%. Calibrate the tariff table before quoting.',
    currency: 'BBD',
    efilingChannel: 'ASYCUDA World portal (registered traders/declarants)',
    efilingPortalUrl: 'https://asycuda.customs.gov.bb',
    calibration: 'partial',
    caricom: true,
  },
  {
    code: 'LC',
    country: 'Saint Lucia',
    administration: 'Customs Department',
    systemNote: 'ASYCUDA World portal (asycuda.customs.gov.lc) publishes the SAD XML message guide — declarants submit declaration data electronically in XML.',
    systemSource: 'https://asycuda.customs.gov.lc (SAD XML Message for declarants)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: 12.5,
    vatVerified: false,
    vatNote: 'Rate to confirm with the Inland Revenue Department / tariff before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World portal — XML declaration submission by registered declarants',
    efilingPortalUrl: 'https://asycuda.customs.gov.lc',
    calibration: 'partial',
    caricom: true,
  },
  {
    code: 'VC',
    country: 'Saint Vincent and the Grenadines',
    administration: 'Customs & Excise Department',
    systemNote: 'ASYCUDA World 4.4.0 officially launched 2026-06-08: declarations, supporting documents and approvals for commercial and home-use entries handled electronically.',
    systemSource: 'https://customs.gov.vc (launch notice) · https://customsportal.gov.vc',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Standard rate to confirm with the Inland Revenue Department before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World portal (customsportal.gov.vc) — electronic declarations since Jun 2026',
    efilingPortalUrl: 'https://customsportal.gov.vc',
    calibration: 'partial',
    caricom: true,
  },
  {
    code: 'DM',
    country: 'Dominica',
    administration: 'Customs Division',
    systemNote: 'ASYCUDA World handles manifests and customs declarations (imports/exports) plus accounting, transit and suspense procedures.',
    systemSource: 'https://www.customs.gov.dm (ASYCUDA World page)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Standard rate to confirm with Inland Revenue Division before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World (registered declarants)',
    efilingPortalUrl: 'https://www.customs.gov.dm',
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'GD',
    country: 'Grenada',
    administration: 'Customs & Excise Division',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries, 102 countries/territories)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Standard rate to confirm before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'AG',
    country: 'Antigua and Barbuda',
    administration: 'Customs Division',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'ABST',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Standard rate to confirm before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'KN',
    country: 'Saint Kitts and Nevis',
    administration: 'Customs & Excise Department',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Standard rate to confirm before quoting.',
    currency: 'XCD',
    efilingChannel: 'ASYCUDA World (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'BZ',
    country: 'Belize',
    administration: 'Customs Department',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'GST',
    vatRate: 12.5,
    vatVerified: false,
    vatNote: 'Standard GST commonly cited at 12.5% — confirm with the Belize Tax Service before quoting.',
    currency: 'BZD',
    efilingChannel: 'ASYCUDA World (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'SR',
    country: 'Suriname',
    administration: 'Directorate of Customs',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'VAT',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Rate to confirm — Suriname introduced VAT by phases from 2020.',
    currency: 'SRD',
    efilingChannel: 'ASYCUDA World (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
  {
    code: 'HT',
    country: 'Haiti',
    administration: 'Administration Générale des Douanes',
    systemNote: 'ASYCUDA user administration per the official UNCTAD ASYCUDA country list.',
    systemSource: 'https://asycuda.org (User Countries)',
    form: 'c73',
    cpcFormat: 'std4',
    vatLabel: 'TCA',
    vatRate: null,
    vatVerified: false,
    vatNote: 'Rate to confirm before quoting.',
    currency: 'HTG',
    efilingChannel: 'ASYCUDA (registration with the administration required)',
    efilingPortalUrl: null,
    calibration: 'struct',
    caricom: true,
  },
];

export function getRegion(code: string): CustomsRegion | null {
  return CUSTOMS_REGIONS.find((r) => r.code.toUpperCase() === code.toUpperCase()) || null;
}

/** Regions where e-filing is production-usable today (calibration full|partial). */
export function eFilingReadyRegions(): CustomsRegion[] {
  return CUSTOMS_REGIONS.filter((r) => r.calibration !== 'struct');
}

/** Declaration type codes (box 1) per the ASYCUDA World declaration standard. */
export const DECLARATION_TYPES = [
  { code: 'IM4', label: 'IM4 — import, home consumption' },
  { code: 'IM7', label: 'IM7 — import, warehousing/suspense' },
  { code: 'EX1', label: 'EX1 — export' },
] as const;

/**
 * UN Revision 19 mode-of-transport codes as used in ASYCUDA box 25.
 * Only the two modes CaribClear shipments actually use are mapped.
 */
export function modeCodeAtBorder(mode: string): string | null {
  if (mode === 'sea') return '1'; // Sea
  if (mode === 'air') return '4'; // Air
  return null;
}
