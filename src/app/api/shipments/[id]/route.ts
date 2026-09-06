import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { SHIPMENT_STATUSES } from '@/lib/engine/seed-data';

const VALID_STATUS = SHIPMENT_STATUSES.map(s => s.key) as readonly string[];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await params;
    const shipment = await db.shipment.findUnique({
      where: { id },
      include: {
        client: true, containers: true, permits: true, quotes: { orderBy: { createdAt: 'desc' } },
        documents: { where: { isCurrent: true }, orderBy: { createdAt: 'desc' } },
        costCalcs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');
    assertTenantOwns(s.tenantId, shipment.tenantId);
    return ok({ shipment });
  } catch (err) { return guardError(err); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await params;
    const shipment = await db.shipment.findUnique({ where: { id } });
    if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');
    assertTenantOwns(s.tenantId, shipment.tenantId);

    const body = await readJson<Record<string, unknown>>(req);
    const parseDate = (v: unknown) => (v ? new Date(String(v)) : null);

    const data: Record<string, unknown> = {};
    const fields = ['mode', 'type', 'status', 'statusNote', 'carrier', 'vesselOrFlight', 'originPort', 'destinationPort', 'incoterm', 'goodsDescription', 'clientId', 'assignedToId'];
    for (const f of fields) if (f in body) data[f] = body[f] === '' ? null : body[f];
    for (const f of ['etd', 'eta', 'demurrageStartDate', 'closedAt']) if (f in body) data[f] = parseDate(body[f]);
    for (const f of ['fobUsd', 'freightUsd', 'insuranceUsd', 'exchangeRate', 'demurrageFreeDays', 'demurragePerDayTtd']) if (f in body) data[f] = body[f] === null ? null : Number(body[f]);

    if ('status' in body && !VALID_STATUS.includes(String(body.status))) {
      return fail(400, 'INVALID_STATUS', `Status must be one of: ${VALID_STATUS.join(', ')}`);
    }

    // Containers sync
    if (Array.isArray(body.containers)) {
      await db.container.deleteMany({ where: { shipmentId: id } });
      const list = body.containers as Array<{ number: string; size?: string; sealNumber?: string; weightKg?: number }>;
      if (list.length > 0) {
        await db.container.createMany({
          data: list.map(c => ({
            shipmentId: id, number: c.number, size: c.size || '40ft',
            sealNumber: c.sealNumber || null, weightKg: c.weightKg ?? null,
          })),
        });
      }
    }

    const updated = await db.shipment.update({ where: { id }, data, include: { containers: true, client: true, permits: true } });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'shipment.updated',
      entityType: 'shipment', entityId: id,
      metadata: {
        status: { old: shipment.status, new: updated.status },
        eta: { old: shipment.eta?.toISOString() ?? null, new: updated.eta?.toISOString() ?? null },
      },
    });

    // Notify importer client when status changes
    if ('status' in body && updated.clientId && updated.status !== shipment.status) {
      const { notify } = await import('@/lib/notify');
      await notify({
        tenantId: s.tenantId, shipmentId: id, type: 'system',
        title: `${updated.reference}: ${updated.status.replace(/_/g, ' ')}`,
        body: `El estado de tu embarque cambió a "${updated.status.replace(/_/g, ' ')}".`,
        channels: ['in_app'],
      });
    }

    return ok({ shipment: updated });
  } catch (err) { return guardError(err); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await params;
    const shipment = await db.shipment.findUnique({ where: { id } });
    if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');
    assertTenantOwns(s.tenantId, shipment.tenantId);
    await db.shipment.delete({ where: { id } });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'shipment.deleted',
      entityType: 'shipment', entityId: id, metadata: { reference: shipment.reference },
    });
    return ok({ deleted: true });
  } catch (err) { return guardError(err); }
}
