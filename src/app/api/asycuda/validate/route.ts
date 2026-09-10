import { NextRequest } from 'next/server';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { assembleDeclarationForShipment, UnknownRegionError } from '@/lib/asycuda-service';

interface ValidateBody {
  shipmentId?: string;
  country?: string;
  office?: string;
  officeOfEntry?: string;
  declarationType?: string;
  currencyCode?: string;
  exchangeRate?: number;
  locationOfGoods?: string;
  deferredPaymentAccount?: string;
}

/**
 * POST /api/asycuda/validate — assemble the ASYCUDA World declaration from
 * REAL shipment data and run full box-level validation. No DB write: this is
 * the "check before you file" step. Returns the declaration preview plus
 * errors (blockers) and warnings (review items).
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<ValidateBody>(req);
    if (!body.shipmentId || !body.country) return fail(400, 'MISSING_FIELDS', 'shipmentId and country are required.');

    try {
      const assembled = await assembleDeclarationForShipment(s.tenantId, body.shipmentId, { ...body, country: body.country! });
      return ok({
        declaration: assembled.declaration,
        errors: assembled.errors,
        warnings: assembled.warnings,
        context: assembled.context,
      });
    } catch (err) {
      if (err instanceof UnknownRegionError) return fail(400, 'BAD_REGION', err.message);
      if ((err as { code?: string }).code === 'NOT_FOUND') return fail(404, 'NOT_FOUND', 'Shipment not found.');
      throw err;
    }
  } catch (err) { return guardError(err); }
}
