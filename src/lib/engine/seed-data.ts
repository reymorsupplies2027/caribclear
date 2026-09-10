/**
 * CaribClear — Seed data: HS/CET subset + T&T permits matrix.
 * Representative entries with real-world 2026 rates (CET bands 0-20% +
 * T&T national deviations). The admin can edit everything from Settings;
 * the engine reads RateConfig, never this file, at runtime.
 */

export interface HsSeedRow {
  code: string; description: string; chapter: string; unit?: string;
  cetRate: number; vatExempt?: boolean; notes?: string;
}

export const HS_SEED: HsSeedRow[] = [
  { code: '0106', description: 'Live animals — other', chapter: '01', cetRate: 0, vatExempt: true, notes: 'CFO permit casi siempre requerido' },
  { code: '0302', description: 'Fish, fresh or chilled', chapter: '03', unit: 'kg', cetRate: 15, notes: 'CFO (Chief Food Officer) import permit' },
  { code: '0406', description: 'Cheese and curd', chapter: '04', unit: 'kg', cetRate: 20, notes: 'CFO permit; CARICOM preferential rates apply' },
  { code: '0710', description: 'Vegetables, frozen', chapter: '07', unit: 'kg', cetRate: 15, notes: 'CFO permit' },
  { code: '1006', description: 'Rice', chapter: '10', unit: 'kg', cetRate: 25, notes: 'CET CARICOM rice band' },
  { code: '1511', description: 'Palm oil and fractions', chapter: '15', unit: 'kg', cetRate: 5 },
  { code: '1701', description: 'Cane/beet sugar', chapter: '17', unit: 'kg', cetRate: 40, notes: 'CARICOM sensitive item' },
  { code: '1905', description: 'Bread, pastry, cakes', chapter: '19', cetRate: 20 },
  { code: '2202', description: 'Non-alcoholic beverages', chapter: '22', unit: 'l', cetRate: 20 },
  { code: '2203', description: 'Beer made from malt', chapter: '22', unit: 'l', cetRate: 50, notes: 'T&T national deviation + excise — verify current schedule' },
  { code: '2402', description: 'Cigars, cigarettes', chapter: '24', cetRate: 75, notes: 'T&T national deviation + excise — verify' },
  { code: '2523', description: 'Portland cement', chapter: '25', unit: 'kg', cetRate: 10, notes: 'TTBS standards apply' },
  { code: '2710', description: 'Petroleum oils, fuels', chapter: '27', unit: 'l', cetRate: 5 },
  { code: '3004', description: 'Medicaments (dosed)', chapter: '30', cetRate: 0, vatExempt: true, notes: 'Chemicals Division notification may apply' },
  { code: '3808', description: 'Pesticides, disinfectants', chapter: '38', cetRate: 5, notes: 'Pesticides & Toxic Chemicals Board approval' },
  { code: '3917', description: 'Plastic tubes/pipes', chapter: '39', cetRate: 15 },
  { code: '3923', description: 'Plastic packaging, sacks, bags', chapter: '39', cetRate: 20, notes: 'Single-use plastics levy 5% CIF where applicable' },
  { code: '3926', description: 'Other plastic articles', chapter: '39', cetRate: 20 },
  { code: '4011', description: 'New pneumatic tyres', chapter: '40', unit: 'pce', cetRate: 20, notes: 'Environmental Tyre Tax TT$40/tyre (2026)' },
  { code: '5208', description: 'Woven cotton fabrics, printed', chapter: '52', cetRate: 10 },
  { code: '6109', description: 'T-shirts, vests, knitwear', chapter: '61', cetRate: 20 },
  { code: '6403', description: 'Footwear, leather uppers', chapter: '64', unit: 'pce', cetRate: 20 },
  { code: '7214', description: 'Steel bars and rods', chapter: '72', unit: 'kg', cetRate: 10 },
  { code: '7318', description: 'Screws, bolts, nuts', chapter: '73', unit: 'kg', cetRate: 10 },
  { code: '8215', description: 'Cutlery sets', chapter: '82', cetRate: 20 },
  { code: '8407', description: 'Spark-ignition engines', chapter: '84', cetRate: 5 },
  { code: '8413', description: 'Pumps for liquids', chapter: '84', cetRate: 5 },
  { code: '8471', description: 'Computers, laptops', chapter: '84', cetRate: 0, vatExempt: true, notes: 'ITA — duty free' },
  { code: '8507', description: 'Electric accumulators (batteries)', chapter: '85', cetRate: 10 },
  { code: '8517', description: 'Phones, smartphones', chapter: '85', cetRate: 0, vatExempt: true },
  { code: '8528', description: 'Televisions, monitors', chapter: '85', cetRate: 20, notes: 'TTBS conformity for electrical goods' },
  { code: '8544', description: 'Insulated wire and cable', chapter: '85', unit: 'kg', cetRate: 10 },
  { code: '8703', description: 'Motor cars (petrol/diesel/EV/hybrid/CNG) — see cc brackets', chapter: '87', unit: 'pce', cetRate: 25, notes: 'Duty por cilindrada: petrol ≤1599cc 25%, ≤2000cc 35%, ≤3000cc 60%, >3000cc 67.5% · diesel ≤1500cc 35%, ≤2000cc 40%, ≤2500cc 60%, >2500cc 67.5% · MVT por cc (foreign-used 75%) · EV privado ≤TT$400k CIF: 0 duty/MVT/VAT (L.N. 479/2025 cl.4B) · híbrido ≤1599cc+≤105kW: 0 duty (L.N. 247/2024) · usados ≤6 años (Budget FY2026)' },
  { code: '8704', description: 'Goods transport trucks', chapter: '87', unit: 'pce', cetRate: 10, notes: 'Depends on GVW bracket' },
  { code: '8708', description: 'Motor vehicle parts & accessories', chapter: '87', cetRate: 30, notes: 'T&T national deviation for auto parts' },
  { code: '8711', description: 'Motorcycles', chapter: '87', unit: 'pce', cetRate: 30 },
  { code: '9018', description: 'Medical devices, instruments', chapter: '90', cetRate: 0, vatExempt: true },
  { code: '9403', description: 'Furniture (other seats etc.)', chapter: '94', cetRate: 20 },
  { code: '9405', description: 'Lamps and lighting fittings', chapter: '94', cetRate: 20 },
  { code: '9503', description: 'Toys, games', chapter: '95', cetRate: 20 },
  { code: '9603', description: 'Brooms, brushes', chapter: '96', cetRate: 20 },
];

export interface PermitSeedRow {
  category: string; title: string; authority: string; description: string;
  hsPrefixes: string; bizLinkUrl?: string; sortOrder: number;
}

export const PERMITS_SEED: PermitSeedRow[] = [
  {
    category: 'cfo_agro', title: 'CFO Import Permit (food/plants/animals)', authority: 'Chief Food Officer — Ministry of Health',
    description: 'Requerido para alimentos, carnes, lácteos, plantas y productos agrícolas. Se solicita por embarque ANTES de zarpar; vigencia típica 3 meses.',
    hsPrefixes: '01,02,03,04,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,21,22,23',
    bizLinkUrl: 'https://www.ttbizlink.gov.tt', sortOrder: 1,
  },
  {
    category: 'ttbs', title: 'TTBS Standards Conformity', authority: 'Trinidad & Tobago Bureau of Standards',
    description: 'Productos regulados (eléctricos, LPG, cemento, juguetes, cables) requieren cumplimiento de norma TTS. Verificación documental o inspección.',
    hsPrefixes: '2523,84,85,94,95',
    bizLinkUrl: 'https://www.ttbizlink.gov.tt', sortOrder: 2,
  },
  {
    category: 'ema_cec', title: 'EMA Certificate of Environmental Clearance (CEC)', authority: 'Environmental Management Authority',
    description: 'Actividades/productos con impacto ambiental designados (neumáticos usados, químicos, equipos industriales) requieren CEC.',
    hsPrefixes: '26,27,28,38,40,84,85,87',
    bizLinkUrl: 'https://www.ema.co.tt', sortOrder: 3,
  },
  {
    category: 'drug_inspectorate', title: 'Drug Inspectorate Import Authorisation', authority: 'Chemicals Division — Ministry of National Security',
    description: 'Medicamentos, precursores químicos y sustancias controladas requieren autorización previa del Inspectorato.',
    hsPrefixes: '29,30,54,55',
    bizLinkUrl: 'https://www.ttbizlink.gov.tt', sortOrder: 4,
  },
  {
    category: 'chemicals', title: 'Pesticides & Toxic Chemicals Board Approval', authority: 'Pesticides & Toxic Chemicals Board',
    description: 'Plaguicidas, desinfectantes y tóxicos domésticos: registro del producto + permiso de importación por embarque.',
    hsPrefixes: '3808',
    bizLinkUrl: 'https://www.ttbizlink.gov.tt', sortOrder: 5,
  },
  {
    category: 'other', title: 'Used Vehicle Pre-Shipment Inspection', authority: 'T&T Customs / approved inspection body',
    description: 'Vehículos usados ≤6 años (Budget FY2026): inspección pre-embarque en origen + título y registro. Verificar límite de edad y concesión EV/hybrid.',
    hsPrefixes: '8703,8704,8711',
    bizLinkUrl: 'https://www.customs.gov.tt', sortOrder: 6,
  },
];

/** Demurrage presets offered in UI (editable per shipment). Defaults mirror the real PLIPDECO tariff: 8 free days, then TT$500/day for each calendar day beyond (tariff sheet, Jun 2023). Other terminals (NPAR, POS) differ — adjust per shipment. */
export const DEMURRAGE_PRESETS = {
  freeDaysDefault: 8,      // PLIPDECO free time
  perDayTtdDefault: 500,   // PLIPDECO 8+ calendar days
  alertDaysBefore: 3,
};

export const SHIPMENT_STATUSES = [
  { key: 'order_placed', label: 'Order placed', es: 'Orden colocada', pct: 10 },
  { key: 'sailed', label: 'Sailed', es: 'Zarpado', pct: 25 },
  { key: 'in_transit', label: 'In transit', es: 'En tránsito', pct: 45 },
  { key: 'arrived', label: 'Arrived', es: 'Arribado', pct: 65 },
  { key: 'unloaded', label: 'Discharged', es: 'Descargado', pct: 80 },
  { key: 'in_customs', label: 'In customs', es: 'En aduana', pct: 92 },
  { key: 'released', label: 'Released', es: 'Liberado', pct: 100 },
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]['key'];
