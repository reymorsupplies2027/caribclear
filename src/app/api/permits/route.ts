import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

/** GET /api/permits?shipmentId=... — matrix + (optionally) a shipment's checklist */
export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const url = new URL(req.url);
    const shipmentId = url.searchParams.get('shipmentId');
    const requirements = await db.permitRequirement.findMany({ orderBy: { sortOrder: 'asc' } });

    if (shipmentId) {
      const shipment = await db.shipment.findUnique({
        where: { id: shipmentId },
        include: { permits: true },
      });
      if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');
      assertTenantOwns(s.tenantId, shipment.tenantId);

      // Suggest requirements whose HS prefixes match the shipment's HS/hints
      const suggestions = requirements.filter(r => {
        const prefixes = (r.hsPrefixes || '').split(',').map(p => p.trim()).filter(Boolean);
        return prefixes.some(p => (shipment.goodsDescription || '').toLowerCase().includes(p.toLowerCase())) ||
          prefixes.some(p => shipment.vesselOrFlight?.toLowerCase().includes(p.toLowerCase()));
      });
      return ok({ requirements, shipmentPermits: shipment.permits, suggestions });
    }
    return ok({ requirements });
  } catch (err) { return guardError(err); }
}

/** POST /api/permits — add a permit requirement instance to a shipment */
export async function POST(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{ shipmentId: string; requirementId?: string; title?: string; authority?: string; category?: string }>(req);
    if (!body.shipmentId || (!body.requirementId && !body.title)) {
      return fail(400, 'MISSING_FIELDS', 'shipmentId + requirementId or title required.');
    }
    const shipment = await db.shipment.findUnique({ where: { id: body.shipmentId } });
    if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');
    assertTenantOwns(s.tenantId, shipment.tenantId);

    const req0 = body.requirementId ? await db.permitRequirement.findUnique({ where: { id: body.requirementId } }) : null;
    const permit = await db.shipmentPermit.create({
      data: {
        shipmentId: body.shipmentId,
        requirementId: body.requirementId || null,
        title: req0?.title || body.title!,
        authority: req0?.authority || body.authority || null,
        category: req0?.category || body.category || 'other',
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'permit.added',
      entityType: 'shipment_permit', entityId: permit.id,
      metadata: { shipment: shipment.reference, title: permit.title },
    });
    return ok({ permit }, 201);
  } catch (err) { return guardError(err); }
}

/** PATCH /api/permits — update status/expiry of a shipment permit */
export async function PATCH(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const body = await readJson<{ id: string; status?: string; expiryDate?: string | null; notes?: string | null }>(req);
    if (!body.id) return fail(400, 'MISSING_ID', 'Permit id required.');
    const permit = await db.shipmentPermit.findUnique({ where: { id: body.id }, include: { shipment: true } });
    if (!permit) return fail(404, 'NOT_FOUND', 'Permit not found.');
    assertTenantOwns(s.tenantId, permit.shipment.tenantId);

    const VALID = ['not_required', 'pending', 'submitted', 'approved', 'rejected'];
    if (body.status && !VALID.includes(body.status)) return fail(400, 'INVALID_STATUS', `Status: ${VALID.join(', ')}`);

    const updated = await db.shipmentPermit.update({
      where: { id: body.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.expiryDate !== undefined ? { expiryDate: body.expiryDate ? new Date(body.expiryDate) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'permit.status_changed',
      entityType: 'shipment_permit', entityId: body.id,
      metadata: { status: { old: permit.status, new: updated.status } },
    });
    return ok({ permit: updated });
  } catch (err) { return guardError(err); }
}
