import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { calculateLandedCost, DEFAULT_RATE_CONFIG, type RateConfigSnapshot } from '@/lib/engine/landed-cost';

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const calcs = await db.costCalculation.findMany({
      where: { tenantId: s.tenantId },
      include: { shipment: { select: { reference: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok({ calcs });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const isPreview = new URL(req.url).searchParams.get('preview') === '1';
    const body = await readJson<Record<string, unknown>>(req);

    const hsCode = String(body.hsCode || '');
    if (!hsCode) return fail(400, 'MISSING_HS', 'HS code is required.');
    const hs = await db.hsCode.findFirst({ where: { code: { startsWith: hsCode.slice(0, 6) } } });
    if (!hs) return fail(404, 'HS_NOT_FOUND', 'HS code not found in the tariff table. Check /dashboard/hs-codes.');

    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
    // Load the ACTIVE versioned config (falls back to compiled default)
    const cfgRow = await db.rateConfig.findFirst({ where: { key: 'engine_snapshot', isActive: true }, orderBy: { version: 'desc' } });
    let config: RateConfigSnapshot = DEFAULT_RATE_CONFIG;
    if (cfgRow) { try { config = JSON.parse(cfgRow.value) as RateConfigSnapshot; } catch { /* fallback */ } }
    if (!cfgRow) {
      await db.rateConfig.create({
        data: {
          key: 'engine_snapshot', version: 1, value: JSON.stringify(DEFAULT_RATE_CONFIG),
          notes: 'Auto-seeded 2026 schedule: CET bands, MVT per-cc, VAT 12.5%, customs fees. Edit via Settings → Rate Configuration.',
          effectiveFrom: new Date('2026-01-01'),
        },
      }).catch(() => null);
    }

    const result = calculateLandedCost({
      fobUsd: Number(body.fobUsd) || 0,
      freightUsd: Number(body.freightUsd) || 0,
      insuranceUsd: Number(body.insuranceUsd) || 0,
      exchangeRate: Number(body.exchangeRate) || tenant?.defaultExchangeRate || 6.80,
      hsCode: hs.code,
      cetRate: Number(body.cetRate ?? hs.cetRate),
      vatExempt: hs.vatExempt,
      vehicle: body.vehicle ? (body.vehicle as { fuel: 'petrol' | 'diesel' | 'ev' | 'hybrid'; engineCc: number; used: boolean; yearOfManufacture?: number }) : undefined,
      containers: Array.isArray(body.containers) ? (body.containers as Array<'20ft' | '40ft' | '40hc' | 'lcl'>) : [],
      tyreCount: body.tyreCount ? Number(body.tyreCount) : undefined,
      isSingleUsePlastics: !!body.isSingleUsePlastics,
      isOnlinePurchase: !!body.isOnlinePurchase,
      config,
    });

    if (isPreview) {
      return ok({ result, calcId: null });
    }

    // Persist calculation
    const calc = await db.costCalculation.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: (body.shipmentId as string) || null,
        name: String(body.name || `Cálculo ${hs.code} ${new Date().toISOString().slice(0, 10)}`),
        hsCode: hs.code, mode: String(body.mode || 'sea'),
        fobUsd: result.cifUsd > 0 ? Number(body.fobUsd) : 0,
        freightUsd: Number(body.freightUsd) || 0,
        insuranceUsd: Number(body.insuranceUsd) || 0,
        exchangeRate: result.exchangeRate,
        vehicleCc: body.vehicle ? (body.vehicle as { engineCc: number }).engineCc : null,
        vehicleUsed: body.vehicle ? !!(body.vehicle as { used: boolean }).used : null,
        vehicleFuel: body.vehicle ? (body.vehicle as { fuel: string }).fuel : null,
        configJson: JSON.stringify({ version: config.version }),
        breakdownJson: JSON.stringify(result),
        cifTtd: result.cifTtd, totalTtd: result.totalTtd,
        createdById: s.userId,
      },
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'cost.calculated',
      entityType: 'cost_calculation', entityId: calc.id,
      metadata: { hsCode: hs.code, totalTtd: result.totalTtd, overCif: result.landedOverCifPct },
    });

    return ok({ result, calcId: calc.id }, 201);
  } catch (err) { return guardError(err); }
}
