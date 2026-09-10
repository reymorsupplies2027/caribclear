/**
 * CaribClear — Multi-tenant isolation test.
 * Simulates 2 tenants sharing the same database (the RLS threat model):
 *   1. Tenant-scoped queries never leak cross-tenant rows.
 *   2. assertTenantOwns blocks cross-tenant resource access (403 path).
 *   3. Portal scoping: an importer only sees its OWN clientId data.
 *   4. Audit chain: entries stay chained per tenant.
 * Run: bun tests/isolation.test.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { assertTenantOwns, ForbiddenError } from '../src/lib/guard';
import { computeEntryHash } from '../src/lib/audit';
import { canTransition, type FilingStatus } from '../src/lib/engine/asycuda';

const db = new PrismaClient();
let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

const suffix = Date.now().toString(36);
const tenantA = `iso-a-${suffix}`;
const tenantB = `iso-b-${suffix}`;

try {
  console.log('\n── Setup: 2 tenants, same DB ──');
  const A = await db.tenant.create({ data: { name: 'Tenant A (broker)', slug: tenantA } });
  const B = await db.tenant.create({ data: { name: 'Tenant B (rival broker)', slug: tenantB } });
  const userA = await db.user.create({ data: { email: `a-${suffix}@test.tt`, name: 'Admin A', role: 'broker_admin', tenantId: A.id, passwordHash: await bcrypt.hash('x', 4) } });
  const clientB1 = await db.client.create({ data: { tenantId: B.id, name: 'B client one' } });
  const clientB2 = await db.client.create({ data: { tenantId: B.id, name: 'B client two' } });

  const sA = await db.shipment.create({ data: { tenantId: A.id, reference: `SA-${suffix}`, goodsDescription: 'A cargo — trade secret pricing' } });
  const sB = await db.shipment.create({ data: { tenantId: B.id, reference: `SB-${suffix}`, goodsDescription: 'B cargo — trade secret pricing', clientId: clientB1.id } });
  await db.shipment.create({ data: { tenantId: B.id, reference: `SB2-${suffix}`, goodsDescription: 'B cargo two', clientId: clientB2.id } });

  console.log('── 1. Tenant-scoped queries ──');
  const seenByA = await db.shipment.findMany({ where: { tenantId: A.id } });
  ok(seenByA.length === 1 && seenByA[0].reference.startsWith('SA'), 'Tenant A ve solo SU embarque');
  const seenByB = await db.shipment.findMany({ where: { tenantId: B.id } });
  ok(seenByB.length === 2 && seenByB.every(s => s.reference.startsWith('SB')), 'Tenant B ve solo SUS 2 embarques');
  ok(!seenByB.some(s => s.tenantId === A.id) && !seenByA.some(s => s.tenantId === B.id), 'cero filtración cruzada en ambos sentidos');

  console.log('── 2. Resource guard (403 path) ──');
  let blocked = false;
  try { assertTenantOwns(A.id, sB.tenantId); } catch (e) { blocked = e instanceof ForbiddenError; }
  ok(blocked, 'assertTenantOwns lanza ForbiddenError al cruzar tenants');
  let ownOk = false;
  try { assertTenantOwns(A.id, sA.tenantId); ownOk = true; } catch { ownOk = false; }
  ok(ownOk, 'acceso al recurso propio pasa');

  console.log('── 3. Portal: importer solo ve lo suyo ──');
  const portalB1 = await db.shipment.findMany({ where: { tenantId: B.id, clientId: clientB1.id } });
  ok(portalB1.length === 1 && portalB1[0].id === sB.id, 'client B1 solo ve SU embarque dentro del tenant B');
  const docsB = await db.document.findMany({
    where: { tenantId: B.id, shipment: { clientId: clientB1.id }, isCurrent: true },
  });
  ok(docsB.length === 0, 'documentos del otro client no aparecen (scoping por clientId)');

  console.log('── 4. Audit hash-chain aislada por tenant ──');
  const meta = { note: 'x' };
  const h1 = computeEntryHash({ tenantId: A.id, action: 't', entityType: 'e', entityId: '1', userId: userA.id, metadata: meta, prevHash: null, timestamp: '2026-01-01T00:00:00.000Z' });
  const h2 = computeEntryHash({ tenantId: B.id, action: 't', entityType: 'e', entityId: '1', userId: userA.id, metadata: meta, prevHash: null, timestamp: '2026-01-01T00:00:00.000Z' });
  ok(h1 !== h2, 'el hash incluye el tenant — cadenas no mezclables');
  const hSame = computeEntryHash({ tenantId: A.id, action: 't', entityType: 'e', entityId: '1', userId: userA.id, metadata: { b: 1, a: 2 }, prevHash: null, timestamp: '2026-01-01T00:00:00.000Z' });
  const hDiff = computeEntryHash({ tenantId: A.id, action: 't', entityType: 'e', entityId: '1', userId: userA.id, metadata: { a: 2, b: 1 }, prevHash: null, timestamp: '2026-01-01T00:00:00.000Z' });
  ok(hSame === hDiff, 'canonical hashing: orden de claves no altera el sello (jsonb-proof)');

  console.log('── 5. e-Filing ASYCUDA: CustomsFiling aislado por tenant ──');
  const filingA = await db.customsFiling.create({
    data: {
      tenantId: A.id,
      shipmentId: sA.id,
      country: 'TT',
      declarationType: 'IM4',
      office: 'Port of Spain',
      cpc: '10 00 000',
      currencyCode: 'USD',
      exchangeRate: 6.80,
      status: 'xml_generated',
      declarationJson: JSON.stringify({ country: 'TT', items: [] }),
      xmlChecksum: 'a'.repeat(64),
      timelineJson: JSON.stringify([{ status: 'xml_generated', at: new Date().toISOString(), byName: 'Admin A', note: 'SAD XML generated' }]),
    },
  });
  const seenByBfilings = await db.customsFiling.findMany({ where: { tenantId: B.id } });
  ok(seenByBfilings.length === 0, 'el filing del tenant A es invisible para el tenant B (scoping en DB real)');
  const crossDirect = await db.customsFiling.findFirst({ where: { id: filingA.id, tenantId: B.id } });
  ok(crossDirect === null, 'lookup directo por id cruzando tenants no devuelve nada');
  let crossBlocked = false;
  try { assertTenantOwns(B.id, filingA.tenantId); } catch (e) { crossBlocked = e instanceof ForbiddenError; }
  ok(crossBlocked, 'guard de aplicación bloquea el acceso cruzado al filing (403)');
  const ownFiling = await db.customsFiling.findFirst({ where: { id: filingA.id, tenantId: A.id } });
  ok(ownFiling !== null && ownFiling.country === 'TT', 'el dueño ve su filing con todos los campos (schema pusheado real)');
  const tl = JSON.parse(ownFiling!.timelineJson);
  ok(Array.isArray(tl) && tl.length === 1 && tl[0].status === 'xml_generated', 'timeline persiste y roundtrip JSON correcto');
  ok(canTransition(ownFiling!.status as FilingStatus, 'filed') && !canTransition(ownFiling!.status as FilingStatus, 'cleared'), 'flujo ASYCUDA validado contra el registro real: filed sí, cleared no');
  const updated = await db.customsFiling.update({
    where: { id: filingA.id },
    data: {
      status: 'registered',
      registrationNumber: 'C 427',
      registrationDate: new Date('2026-08-12'),
      assessmentNumber: 'A-9911',
      assessedTotal: 158442.5,
    },
  });
  ok(updated.status === 'registered' && updated.registrationNumber === 'C 427' && updated.assessedTotal === 158442.5, 'CUSRES registrado: entry no. + assessment persisten (box B)');

  console.log('\n── Cleanup ──');
  await db.tenant.delete({ where: { id: A.id } });
  await db.tenant.delete({ where: { id: B.id } });
  console.log('  tenants de prueba eliminados');
} finally {
  await db.$disconnect();
}
console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) process.exit(1);
