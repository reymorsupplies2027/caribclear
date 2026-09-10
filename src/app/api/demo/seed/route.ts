import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { HS_SEED, PERMITS_SEED, SHIPMENT_STATUSES } from '@/lib/engine/seed-data';
import { calculateLandedCost, DEFAULT_RATE_CONFIG } from '@/lib/engine/landed-cost';
import { appendAuditLog } from '@/lib/audit';
import { round2 } from '@/lib/engine/landed-cost';

/**
 * GET  → HTML page with credentials + button (browser friendly)
 * POST → seeds the demo dataset (idempotent: wipes demo tenant first)
 */

const DEMO_EMAIL = 'admin@caribbeanfreight.demo';
const DEMO_PASSWORD = 'Demo2026!';

async function seed() {
  const year = new Date().getFullYear();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

  // Idempotent: remove previous demo tenant + regional tower tenants
  const demoSlugs = ['caribbean-freight-demo', 'kingston-freight-partners', 'bridgetown-clearing-co', 'georgetown-import-hub'];
  for (const slug of demoSlugs) {
    const prev = await db.tenant.findUnique({ where: { slug } });
    if (prev) await db.tenant.delete({ where: { id: prev.id } });
  }
  await db.user.deleteMany({ where: { email: { in: [DEMO_EMAIL, 'operator@caribbeanfreight.demo', 'importer@demo.tt', 'admin@kingstonfreight.demo', 'admin@bridgetownclearing.demo', 'admin@georgetownhub.demo', 'wizard@test.bb'] } } });
  await db.hsCode.deleteMany({});
  await db.permitRequirement.deleteMany({});
  await db.rateConfig.deleteMany({ where: { key: 'engine_snapshot' } });

  // Platform super admin — UPSERT, never deleted (deleting a user would break
  // the hash-chain references to their id; the WORM chain detected this in E2E).
  const superAdmin = await db.user.upsert({
    where: { email: 'super@caribclear.dev' },
    update: {},
    create: {
      email: 'super@caribclear.dev', name: 'Platform Admin', role: 'super_admin',
      passwordHash: await bcrypt.hash('Super2026!', 10),
    },
  });

  // Rate config v1 (2026 schedule)
  await db.rateConfig.create({
    data: {
      key: 'engine_snapshot', version: 1,
      value: JSON.stringify(DEFAULT_RATE_CONFIG),
      notes: 'CET bands + T&T national deviations, MVT per-cc (foreign-used 75%), VAT 12.5%, 2026 customs fees.',
      effectiveFrom: new Date('2026-01-01'),
    },
  });

  // Tariff + permits
  await db.hsCode.createMany({ data: HS_SEED.map(h => ({ code: h.code, description: h.description, chapter: h.chapter, unit: h.unit ?? null, cetRate: h.cetRate, vatExempt: !!h.vatExempt, notes: h.notes ?? null })) });
  await db.permitRequirement.createMany({ data: PERMITS_SEED });

  // Demo tenant + users
  const tenant = await db.tenant.create({
    data: {
      name: 'Caribbean Freight & Trade Ltd', slug: 'caribbean-freight-demo',
      plan: 'pro', defaultExchangeRate: 6.80,
      region: 'Trinidad', city: 'Port of Spain', contactEmail: DEMO_EMAIL,
      priceUsd: 149,
      onboarding: JSON.stringify([
        { id: 'company', label: 'Company profile', done: true },
        { id: 'exchange_rate', label: 'Set TT$/USD exchange rate', done: true },
        { id: 'hs_codes', label: 'Review HS/CET rates', done: true },
        { id: 'first_shipment', label: 'Create first shipment', done: true },
        { id: 'invite_client', label: 'Invite an importer client', done: true },
      ]),
      onboardingStep: 3,
    },
  });
  const admin = await db.user.create({
    data: { email: DEMO_EMAIL, name: 'Alicia Ramkissoon', role: 'broker_admin', tenantId: tenant.id, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) },
  });
  const operator = await db.user.create({
    data: { email: 'operator@caribbeanfreight.demo', name: 'Dwayne Charles', role: 'operator', tenantId: tenant.id, passwordHash: await bcrypt.hash('Demo2026!', 10) },
  });

  // Importer clients + portal users
  const client1 = await db.client.create({
    data: { tenantId: tenant.id, name: 'Sanchez Home & Auto', email: 'importer@demo.tt', phone: '+1-868-555-0101', company: 'Sanchez Home & Auto Ltd', trinNumber: 'TRN-001-222-333', address: 'Chaguanas, Trinidad' },
  });
  const client2 = await db.client.create({
    data: { tenantId: tenant.id, name: 'Trini Foods Distribution', email: 'orders@trinifoods.tt', phone: '+1-868-555-0202', company: 'Trini Foods Distribution Ltd' },
  });
  await db.user.create({
    data: { email: 'importer@demo.tt', name: 'Carlos Sanchez', role: 'importer', tenantId: tenant.id, clientId: client1.id, passwordHash: await bcrypt.hash('Demo2026!', 10) },
  });

  const mk = (status: string, i: number, over: Record<string, unknown>) => ({
    tenantId: tenant.id, clientId: null as string | null, reference: `CC-${year}-000${i}`,
    mode: 'sea', type: 'import', status, goodsDescription: 'General cargo',
    fobUsd: 10000, freightUsd: 1500, insuranceUsd: 500,
    demurrageFreeDays: 5, demurragePerDayTtd: 350, createdById: admin.id, ...over,
  });

  // 5 shipments in different states
  const s1 = await db.shipment.create({ data: mk('order_placed', 1, { clientId: client1.id, goodsDescription: 'Household appliances and auto parts (HS 8528/8708)', fobUsd: 24500, freightUsd: 3200, insuranceUsd: 490, carrier: 'Maersk', vesselOrFlight: 'MAERSK SELETAR / 526E', originPort: 'Shanghai, CN', destinationPort: 'Port of Spain, TT', etd: daysAhead(4), eta: daysAhead(31), incoterm: 'FOB', containers: { create: [{ number: 'MAEU1234567', size: '40hc', sealNumber: 'SL-98213' }] } }) });
  const s2 = await db.shipment.create({ data: mk('in_transit', 2, { clientId: client2.id, goodsDescription: 'Frozen vegetables and processed foods (HS 0710/1905) — CFO permit', fobUsd: 18200, freightUsd: 4100, insuranceUsd: 365, carrier: 'Hapag-Lloyd', vesselOrFlight: 'ALGOL / 22W12', originPort: 'Miami, US', destinationPort: 'Port of Spain, TT', etd: daysAgo(9), eta: daysAhead(3), incoterm: 'CIF', containers: { create: [{ number: 'HLXU7654321', size: '40ft', sealNumber: 'SL-11452' }, { number: 'HLXU7654322', size: '20ft' }] } }) });
  const s3 = await db.shipment.create({ data: mk('in_customs', 3, { clientId: client1.id, goodsDescription: 'Foreign-used vehicle 1500cc petrol (HS 8703)', fobUsd: 9500, freightUsd: 1800, insuranceUsd: 190, carrier: 'NYK Line', vesselOrFlight: 'NISSHO TRANSFORMER / V.091', originPort: 'Yokohama, JP', destinationPort: 'Port of Spain, TT', etd: daysAgo(24), eta: daysAgo(4), incoterm: 'FOB', demurrageStartDate: daysAgo(4), demurrageFreeDays: 5, containers: { create: [{ number: 'NYKU4433221', size: '20ft' }] } }) });
  const s4 = await db.shipment.create({ data: mk('arrived', 4, { goodsDescription: 'Construction materials: cement and steel bars (HS 2523/7214)', fobUsd: 30800, freightUsd: 5200, insuranceUsd: 610, carrier: 'CMA CGM', vesselOrFlight: 'CHARLES ISLAND / 0MX9W', originPort: 'Santos, BR', destinationPort: 'Port of Spain, TT', etd: daysAgo(14), eta: daysAgo(2), incoterm: 'CFR', demurrageStartDate: daysAgo(2), containers: { create: [{ number: 'CMAU9988776', size: '40ft' }, { number: 'CMAU9988777', size: '40ft' }] } }) });
  const s5 = await db.shipment.create({ data: mk('released', 5, { clientId: client2.id, status: 'released', goodsDescription: 'Medical devices for clinics (HS 9018)', fobUsd: 46000, freightUsd: 2100, insuranceUsd: 920, carrier: 'DHL Air', vesselOrFlight: 'DHL447/09AUG', originPort: 'Frankfurt, DE', destinationPort: 'Piarco Air Cargo, TT', mode: 'air', etd: daysAgo(30), eta: daysAgo(28), closedAt: daysAgo(18), incoterm: 'CIP' }) });

  // Permits per shipment (from matrix)
  const matrix = await db.permitRequirement.findMany();
  const cfo = matrix.find(m => m.category === 'cfo_agro');
  const ttbs = matrix.find(m => m.category === 'ttbs');
  const vehicle = matrix.find(m => m.category === 'other');
  if (cfo) await db.shipmentPermit.create({ data: { shipmentId: s2.id, requirementId: cfo.id, title: cfo.title, authority: cfo.authority, category: cfo.category, status: 'submitted' } });
  if (ttbs) await db.shipmentPermit.create({ data: { shipmentId: s1.id, requirementId: ttbs.id, title: ttbs.title, authority: ttbs.authority, category: ttbs.category, status: 'pending' } });
  if (vehicle) await db.shipmentPermit.create({ data: { shipmentId: s3.id, requirementId: vehicle.id, title: vehicle.title, authority: vehicle.authority, category: vehicle.category, status: 'approved', expiryDate: daysAhead(45) } });

  // Documents
  await db.document.createMany({ data: [
    { tenantId: tenant.id, shipmentId: s1.id, groupKey: 'g-bl-1', type: 'bl', title: 'Bill of Lading — MAERSK SELETAR', fileName: 'bl-maeu1234567.pdf', mimeType: 'application/pdf', fileSize: 184320, storageKey: 'demo/bl-1.pdf', uploadedById: operator.id },
    { tenantId: tenant.id, shipmentId: s2.id, groupKey: 'g-bl-2', type: 'bl', title: 'Bill of Lading — ALGOL', fileName: 'bl-hlxu7654321.pdf', mimeType: 'application/pdf', fileSize: 201400, storageKey: 'demo/bl-2.pdf', uploadedById: operator.id },
    { tenantId: tenant.id, shipmentId: s2.id, groupKey: 'g-cfo-1', type: 'permit', title: 'CFO Import Permit — Frozen foods', fileName: 'cfo-permit-2026.pdf', mimeType: 'application/pdf', fileSize: 98304, storageKey: 'demo/cfo.pdf', expiryDate: daysAhead(21), uploadedById: admin.id },
    { tenantId: tenant.id, shipmentId: s3.id, groupKey: 'g-inv-3', type: 'commercial_invoice', title: 'Commercial Invoice — 2019 Toyota Axio', fileName: 'invoice-axio.pdf', mimeType: 'application/pdf', fileSize: 88220, storageKey: 'demo/inv3.pdf', uploadedById: admin.id },
    { tenantId: tenant.id, shipmentId: s5.id, groupKey: 'g-c2-5', type: 'c2', title: 'C2 Declaration — Medical devices', fileName: 'c2-dhl447.pdf', mimeType: 'application/pdf', fileSize: 121000, storageKey: 'demo/c2.pdf', uploadedById: operator.id },
  ] });

  // Landed cost demo calculations using the ENGINE (guarantees consistency)
  const calc = (shipment: typeof s1, hsCode: string, cetRate: number, vehicle?: { fuel: 'petrol' | 'diesel'; engineCc: number; used: boolean; yearOfManufacture?: number }) => {
    const result = calculateLandedCost({
      fobUsd: shipment.fobUsd, freightUsd: shipment.freightUsd, insuranceUsd: shipment.insuranceUsd,
      exchangeRate: 6.80, hsCode, cetRate, vehicle,
      containers: ['40ft'], config: DEFAULT_RATE_CONFIG,
    });
    return {
      tenantId: tenant.id, shipmentId: shipment.id,
      name: `${hsCode} — ${shipment.reference}`, hsCode, mode: shipment.mode,
      fobUsd: shipment.fobUsd, freightUsd: shipment.freightUsd, insuranceUsd: shipment.insuranceUsd,
      exchangeRate: 6.80, vehicleCc: vehicle?.engineCc ?? null, vehicleUsed: vehicle?.used ?? null, vehicleFuel: vehicle?.fuel ?? null,
      configJson: JSON.stringify({ version: 1 }), breakdownJson: JSON.stringify(result),
      cifTtd: result.cifTtd, totalTtd: result.totalTtd, createdById: admin.id,
    };
  };
  await db.costCalculation.create({ data: calc(s1, '8528', 20) });
  await db.costCalculation.create({ data: calc(s3, '8703', 25, { fuel: 'petrol', engineCc: 1500, used: true, yearOfManufacture: 2019 }) });

  // Quote + invoice for the client
  const fees = [
    { kind: 'fee' as const, description: 'Broker professional fee — clearance', amount: 1850 },
    { kind: 'fee' as const, description: 'Documentation & C73 processing', amount: 350 },
  ];
  const disb = [
    { kind: 'disbursement' as const, description: 'Customs declaration fee', amount: 80 },
    { kind: 'disbursement' as const, description: 'Container examination (20ft)', amount: 750 },
    { kind: 'disbursement' as const, description: 'Port storage (3 days)', amount: 540 },
  ];
  const feesTotal = round2(fees.reduce((s, i) => s + i.amount, 0));
  const disbTotal = round2(disb.reduce((s, i) => s + i.amount, 0));
  const vatTotal = round2(feesTotal * 0.125);
  await db.quote.create({
    data: {
      tenantId: tenant.id, clientId: client1.id, shipmentId: s3.id,
      number: `QT-${year}-0001`, type: 'quote', status: 'sent',
      itemsJson: JSON.stringify([...fees, ...disb]),
      feesTotal, disbursementsTotal: disbTotal, vatRate: 12.5, vatTotal,
      total: round2(feesTotal + disbTotal + vatTotal),
      validUntil: daysAhead(14), notes: 'Clearance + delivery Chaguanas. 1500cc foreign-used vehicle.',
    },
  });
  await db.quote.create({
    data: {
      tenantId: tenant.id, clientId: client2.id, shipmentId: s5.id,
      number: `IN-${year}-0001`, type: 'invoice', status: 'paid',
      itemsJson: JSON.stringify([{ kind: 'fee' as const, description: 'Air clearance fee', amount: 1450 }]),
      feesTotal: 1450, disbursementsTotal: 830, vatRate: 12.5, vatTotal: round2(1450 * 0.125),
      total: round2(1450 + 830 + round2(1450 * 0.125)),
      dueDate: daysAgo(20), approvedAt: daysAgo(22),
    },
  });

  // Notifications
  await db.notification.createMany({ data: [
    { tenantId: tenant.id, type: 'demurrage', severity: 'critical', title: 'Demurrage: free days end in 1 day', body: 'Shipment CC-2026-0003 (vehicle): penalty TT$350/day from tomorrow.', shipmentId: s3.id },
    { tenantId: tenant.id, type: 'eta', severity: 'info', title: 'ETA in 3 days — CC-2026-0002', body: 'ALGOL arrives in 3 days. Prepare the CFO permit and refrigerated transport.', shipmentId: s2.id },
    { tenantId: tenant.id, type: 'quote_approved', severity: 'info', title: 'Quote sent to client', body: 'QT-2026-0001 awaiting approval by Sanchez Home & Auto.', shipmentId: s3.id },
  ] });

  // ── Platform billing history for demo tenant (landlord view) ──
  await db.tenantInvoice.createMany({ data: [
    { tenantId: tenant.id, amount: 149, currency: 'USD', status: 'paid', period: `${year}-07`, dueDate: daysAgo(45), paidAt: daysAgo(44) },
    { tenantId: tenant.id, amount: 149, currency: 'USD', status: 'paid', period: `${year}-08`, dueDate: daysAgo(15), paidAt: daysAgo(16) },
    { tenantId: tenant.id, amount: 149, currency: 'USD', status: 'overdue', period: `${year}-09`, dueDate: daysAgo(3) },
  ] });

  // ── Regional tenants (control tower — multi-region occupancy) ──
  const regionalTenants = [
    {
      name: 'Kingston Freight Partners', slug: 'kingston-freight-partners', region: 'Jamaica', city: 'Kingston',
      plan: 'pro', priceUsd: 149, contactEmail: 'admin@kingstonfreight.demo', tz: 'America/Jamaica',
      admin: { email: 'admin@kingstonfreight.demo', name: 'Marlene Hooper' },
      inv: [
        { amount: 149, status: 'paid', period: `${year}-08`, dueDate: daysAgo(15), paidAt: daysAgo(17) },
        { amount: 149, status: 'pending', period: `${year}-09`, dueDate: daysAhead(12) },
      ],
      shipment: { ref: 6, status: 'in_transit', desc: 'Coffee and agro exports (HS 0901)', carrier: 'Seaboard Marine', origin: 'Kingston, JM' },
    },
    {
      name: 'Bridgetown Clearing Co', slug: 'bridgetown-clearing-co', region: 'Barbados', city: 'Bridgetown',
      plan: 'free', priceUsd: null, contactEmail: 'admin@bridgetownclearing.demo', tz: 'America/Barbados',
      admin: { email: 'admin@bridgetownclearing.demo', name: 'Ronald Sealy' },
      inv: [],
      shipment: { ref: 7, status: 'arrived', desc: 'Retail goods (HS 6109)', carrier: 'Tropical Shipping', origin: 'West Palm Beach, US' },
    },
    {
      name: 'Georgetown Import Hub', slug: 'georgetown-import-hub', region: 'Guyana', city: 'Georgetown',
      plan: 'pro', priceUsd: 129, contactEmail: 'admin@georgetownhub.demo', tz: 'America/Guyana',
      admin: { email: 'admin@georgetownhub.demo', name: 'Priya Singh' },
      inv: [
        { amount: 129, status: 'paid', period: `${year}-08`, dueDate: daysAgo(15), paidAt: daysAgo(10) },
      ],
      shipment: { ref: 8, status: 'in_customs', desc: 'Construction equipment parts (HS 8431)', carrier: 'CMA CGM', origin: 'Shenzhen, CN' },
      isActive: false as const,
    },
  ];
  for (const rt of regionalTenants) {
    const t = await db.tenant.create({
      data: {
        name: rt.name, slug: rt.slug, plan: rt.plan, priceUsd: rt.priceUsd,
        region: rt.region, city: rt.city, contactEmail: rt.contactEmail, timezone: rt.tz,
        isActive: rt.isActive ?? true,
        defaultExchangeRate: rt.plan === 'pro' ? 6.80 : 6.80,
      },
    });
    const rtAdmin = await db.user.create({
      data: { email: rt.admin.email, name: rt.admin.name, role: 'broker_admin', tenantId: t.id, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) },
    });
    const year2 = new Date().getFullYear();
    const rs = await db.shipment.create({
      data: {
        tenantId: t.id, reference: `CC-${year2}-000${rt.shipment.ref}`, status: rt.shipment.status,
        goodsDescription: rt.shipment.desc, fobUsd: 12000, freightUsd: 2400, insuranceUsd: 300,
        carrier: rt.shipment.carrier, originPort: rt.shipment.origin, destinationPort: t.city ?? 'Port of Spain',
        demurrageFreeDays: 5, demurragePerDayTtd: 350,
        etd: daysAgo(12), eta: rt.shipment.status === 'in_customs' ? daysAgo(6) : daysAhead(5),
        demurrageStartDate: rt.shipment.status === 'in_customs' ? daysAgo(6) : null,
        createdById: rtAdmin.id,
        containers: { create: [{ number: `REG${rt.shipment.ref}000111`, size: '40ft' }] },
      },
    });
    if (rt.inv.length) await db.tenantInvoice.createMany({ data: rt.inv.map(i => ({ tenantId: t.id, amount: i.amount, currency: 'USD', status: i.status, period: i.period, dueDate: i.dueDate, paidAt: i.paidAt ?? null })) });
    await appendAuditLog({ tenantId: t.id, userId: rtAdmin.id, action: 'demo.seeded', entityType: 'tenant', entityId: t.id, metadata: { shipment: rs.reference } });
  }

  // Audit trail seeds
  await appendAuditLog({ tenantId: tenant.id, userId: admin.id, action: 'demo.seeded', entityType: 'tenant', entityId: tenant.id, metadata: { shipments: 5, clients: 2 } });
  await appendAuditLog({ tenantId: null, userId: superAdmin.id, action: 'platform.seeded', entityType: 'platform', metadata: { tenants: 4, regionalTenants: 3 } });

  return {
    tenant: { name: tenant.name, slug: tenant.slug, plan: tenant.plan },
    credentials: {
      brokerAdmin: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      operator: { email: 'operator@caribbeanfreight.demo', password: 'Demo2026!' },
      importerPortal: { email: 'importer@demo.tt', password: 'Demo2026!' },
      superAdmin: { email: 'super@caribclear.dev', password: 'Super2026!' },
    },
    counts: { shipments: 8, hsCodes: HS_SEED.length, permitRules: PERMITS_SEED.length, clients: 2, tenants: 4 },
  };
}

export async function GET() {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>CaribClear Demo Seed</title><style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;padding:40px 16px}main{max-width:520px;width:100%}h1{font-size:1.4rem}code{background:#1e293b;padding:2px 8px;border-radius:6px}button{background:#f59e0b;color:#0f172a;border:0;padding:14px 24px;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;width:100%;margin-top:16px}ul{line-height:2}a{color:#fbbf24}</style></head><body><main><h1>🌱 CaribClear — Demo Seed</h1><p>Creates: <strong>Caribbean Freight &amp; Trade Ltd</strong> (Pro tenant), 3 users, 1 importer portal user, 1 platform super admin, 5 shipments (order_placed → in_transit → in_customs → arrived → released), documents, permits, landed-cost calcs, quotes and notifications.</p><ul><li>Broker Admin: <code>admin@caribbeanfreight.demo</code> / <code>Demo2026!</code></li><li>Operator: <code>operator@caribbeanfreight.demo</code> / <code>Demo2026!</code></li><li>Importer (portal): <code>importer@demo.tt</code> / <code>Demo2026!</code></li><li>Super Admin: <code>super@caribclear.dev</code> / <code>Super2026!</code></li></ul><button onclick="location.href='/login?demo=1'">Go to Login</button><p style="margin-top:16px;font-size:.85rem;color:#94a3b8">Or POST to <code>/api/demo/seed</code> for JSON.</p></main></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function POST(_req: NextRequest) {
  try {
    const result = await seed();
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[seed]', err);
    return NextResponse.json(
      { success: false, error: { message: err instanceof Error ? err.message : 'Seed failed' } },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
void SHIPMENT_STATUSES;
