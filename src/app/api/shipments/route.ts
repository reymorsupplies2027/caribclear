import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

async function nextReference(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  // Folio is per-tenant (composite unique [tenantId, reference]); scan the tenant's
  // own references so concurrent creates never collide within the tenant.
  const refs = await db.shipment.findMany({
    where: { tenantId, reference: { startsWith: `CC-${year}-` } },
    select: { reference: true },
  });
  let n = refs.length;
  const taken = new Set(refs.map(r => r.reference));
  let candidate = '';
  do {
    n += 1;
    candidate = `CC-${year}-${String(n).padStart(4, '0')}`;
  } while (taken.has(candidate));
  return candidate;
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const q = url.searchParams.get('q') || undefined;
    const shipments = await db.shipment.findMany({
      where: {
        tenantId: s.tenantId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(q ? {
          OR: [
            { reference: { contains: q } },
            { goodsDescription: { contains: q } },
            { carrier: { contains: q } },
            { client: { is: { name: { contains: q } } } },
          ],
        } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        containers: { select: { id: true } },
        documents: { where: { isCurrent: true }, select: { id: true } },
        permits: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ shipments });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<Record<string, unknown>>(req);
    if (!body.goodsDescription) return fail(400, 'MISSING_FIELDS', 'Goods description is required.');

    const parseDate = (v: unknown) => (v ? new Date(String(v)) : null);
    const shipment = await db.shipment.create({
      data: {
        tenantId: s.tenantId,
        clientId: (body.clientId as string) || null,
        reference: await nextReference(s.tenantId),
        mode: (body.mode as string) || 'sea',
        type: (body.type as string) || 'import',
        status: (body.status as string) || 'order_placed',
        carrier: (body.carrier as string) || null,
        vesselOrFlight: (body.vesselOrFlight as string) || null,
        originPort: (body.originPort as string) || null,
        destinationPort: (body.destinationPort as string) || null,
        etd: parseDate(body.etd),
        eta: parseDate(body.eta),
        incoterm: (body.incoterm as string) || null,
        goodsDescription: String(body.goodsDescription),
        fobUsd: Number(body.fobUsd) || 0,
        freightUsd: Number(body.freightUsd) || 0,
        insuranceUsd: Number(body.insuranceUsd) || 0,
        exchangeRate: body.exchangeRate ? Number(body.exchangeRate) : null,
        demurrageFreeDays: Number(body.demurrageFreeDays) || 5,
        demurragePerDayTtd: Number(body.demurragePerDayTtd) || 350,
        demurrageStartDate: parseDate(body.demurrageStartDate),
        assignedToId: (body.assignedToId as string) || null,
        createdById: s.userId,
        containers: {
          create: Array.isArray(body.containers)
            ? (body.containers as Array<{ number: string; size?: string; sealNumber?: string; weightKg?: number }>).map(c => ({
                number: c.number, size: c.size || '40ft', sealNumber: c.sealNumber || null, weightKg: c.weightKg ?? null,
              }))
            : [],
        },
      },
      include: { containers: true, client: { select: { id: true, name: true } } },
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'shipment.created',
      entityType: 'shipment', entityId: shipment.id,
      metadata: { reference: shipment.reference, mode: shipment.mode, goods: shipment.goodsDescription.slice(0, 100) },
    });

    // Auto-suggest permits from HS patterns handled at permit page; notify watchers
    const { notify } = await import('@/lib/notify');
    await notify({
      tenantId: s.tenantId, shipmentId: shipment.id, type: 'system',
      title: `Shipment ${shipment.reference} created`,
      body: `${shipment.goodsDescription.slice(0, 80)} — initial status: order placed.`,
    });

    return ok({ shipment }, 201);
  } catch (err) { return guardError(err); }
}
