import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { STATUS_LABELS, type FilingStatus } from '@/lib/engine/asycuda';

/**
 * GET /api/asycuda/filings[?shipmentId=] — list the tenant's customs filings
 * (newest first). Tenant-scoped: Prisma where includes tenantId, so another
 * broker's filings are invisible.
 */
export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const shipmentId = url.searchParams.get('shipmentId');
    const filings = await db.customsFiling.findMany({
      where: { tenantId: s.tenantId, ...(shipmentId ? { shipmentId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true, shipmentId: true, country: true, declarationType: true, office: true,
        status: true, currencyCode: true, exchangeRate: true, registrationNumber: true,
        registrationDate: true, assessmentNumber: true, assessedTotal: true,
        receiptNumber: true, paidAt: true, xmlChecksum: true, timelineJson: true,
        updatedAt: true, createdAt: true,
        shipment: { select: { reference: true, goodsDescription: true, client: { select: { name: true, company: true } } } },
      },
    });
    return ok({
      filings: filings.map((f) => ({ ...f, statusLabel: STATUS_LABELS[f.status as FilingStatus] || f.status })),
    });
  } catch (err) { return guardError(err); }
}
