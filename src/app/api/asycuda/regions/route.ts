import { NextRequest } from 'next/server';
import { ok, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { CUSTOMS_REGIONS, DECLARATION_TYPES, eFilingReadyRegions } from '@/lib/engine/customs-regions';
import { FILING_STATUSES, STATUS_LABELS } from '@/lib/engine/asycuda';

/**
 * GET /api/asycuda/regions — regional customs registry that powers the
 * e-filing UI: administration, system status (with official source), entry
 * form, CPC format, VAT label/rate, currency, e-filing channel and
 * calibration level per Caribbean country. Public to signed-in tenants.
 */
export async function GET(req: NextRequest) {
  try {
    await requireTenant(req);
    return ok({
      regions: CUSTOMS_REGIONS,
      eFilingReady: eFilingReadyRegions().map((r) => r.code),
      declarationTypes: DECLARATION_TYPES,
      statuses: FILING_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] })),
    });
  } catch (err) { return guardError(err); }
}
