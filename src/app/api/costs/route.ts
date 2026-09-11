import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { calculateLandedCost, normalizeRateConfig, DEFAULT_RATE_CONFIG, type RateConfigSnapshot } from '@/lib/engine/landed-cost';
import { computeRegionLandedCost, getRegionRateSet, RegionNotCalibratedError } from '@/lib/engine/region-rates';
import { planCoversRegion } from '@/lib/plans';
import { assertPlanLimit, checkCalcAllowance, startOfCurrentMonth } from '@/lib/plan-guard';

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

    // ── Plan limit: persisted calculations per month (server-side; Free = 10) ──
    // Previews never persist and never consume quota. Only official, saved
    // calculations (which carry the audit trail and feed e-filing) count.
    if (!isPreview) {
      const tenantForPlan = await db.tenant.findUnique({ where: { id: s.tenantId }, select: { plan: true } });
      const calcsThisMonth = await db.costCalculation.count({
        where: { tenantId: s.tenantId, createdAt: { gte: startOfCurrentMonth() } },
      });
      assertPlanLimit(
        checkCalcAllowance(tenantForPlan?.plan || 'free', calcsThisMonth),
        'PLAN_LIMIT_CALCS', 'saved calculations per month (previews are unlimited and free)',
      );
    }

    const hsCode = String(body.hsCode || '');
    if (!hsCode) return fail(400, 'MISSING_HS', 'HS code is required.');
    const hs = await db.hsCode.findFirst({ where: { code: { startsWith: hsCode.slice(0, 6) } } });
    if (!hs) return fail(404, 'HS_NOT_FOUND', 'HS code not found in the tariff table. Check /dashboard/hs-codes.');

    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });

    // ── Regional path: general goods outside Trinidad & Tobago ──
    // CARICOM CET duty is shared; per-country sales tax + surcharges come
    // from the verified regional rate sets. Vehicles refuse (honest scope).
    const regionCode = String(body.regionCode || 'TT').toUpperCase();
    if (regionCode !== 'TT') {
      const rateSet = getRegionRateSet(regionCode);
      if (!rateSet) return fail(404, 'REGION_NOT_READY', `No landed-cost rate set for region ${regionCode} yet. Available: JM, BB, GY, LC, VC, GD, AG.`);
      if (!planCoversRegion(tenant?.plan || 'free', regionCode)) {
        return fail(403, 'PLAN_UPGRADE_REQUIRED', `The ${tenant?.plan || 'free'} plan covers Trinidad & Tobago only. Upgrade to Regional to calculate ${rateSet.country} landed cost.`);
      }
      try {
        const regionResult = computeRegionLandedCost({
          fobUsd: Number(body.fobUsd) || 0,
          freightUsd: Number(body.freightUsd) || 0,
          insuranceUsd: Number(body.insuranceUsd) || 0,
          fxLocalPerUsd: Number(body.fxLocalPerUsd) || 0,
          hsCode: hs.code,
          cetRate: Number(body.cetRate ?? hs.cetRate),
          unitCount: body.unitCount ? Number(body.unitCount) : undefined,
          rateSet,
        });
        if (isPreview) return ok({ result: null, regionResult, calcId: null });
        const calc = await db.costCalculation.create({
          data: {
            tenantId: s.tenantId,
            shipmentId: (body.shipmentId as string) || null,
            name: String(body.name || `Calculation ${rateSet.country} ${hs.code} ${new Date().toISOString().slice(0, 10)}`),
            hsCode: hs.code, mode: String(body.mode || 'sea'),
            fobUsd: Number(body.fobUsd) || 0,
            freightUsd: Number(body.freightUsd) || 0,
            insuranceUsd: Number(body.insuranceUsd) || 0,
            exchangeRate: Number(body.fxLocalPerUsd) || 0,
            regionCode, regionCurrency: rateSet.currency,
            configJson: JSON.stringify({ rateSet: rateSet.code, source: rateSet.sourceNote }),
            breakdownJson: JSON.stringify(regionResult),
            cifTtd: regionResult.cifLocal, totalTtd: regionResult.totalLocal,
            createdById: s.userId,
          },
        });
        await appendAuditLog({
          tenantId: s.tenantId, userId: s.userId, action: 'cost.calculated.regional',
          entityType: 'cost_calculation', entityId: calc.id,
          metadata: { hsCode: hs.code, region: regionCode, totalLocal: regionResult.totalLocal, currency: rateSet.currency },
        });
        return ok({ result: null, regionResult, calcId: calc.id }, 201);
      } catch (e) {
        if (e instanceof RegionNotCalibratedError) {
          return fail(422, e.code, e.message);
        }
        throw e;
      }
    }

    // Load the ACTIVE versioned config (normalize legacy v1/v2 shapes; falls back to compiled default)
    const cfgRow = await db.rateConfig.findFirst({ where: { key: 'engine_snapshot', isActive: true }, orderBy: { version: 'desc' } });
    let config: RateConfigSnapshot = DEFAULT_RATE_CONFIG;
    if (cfgRow) { try { config = normalizeRateConfig(JSON.parse(cfgRow.value)); } catch { /* fallback */ } }
    if (!cfgRow) {
      await db.rateConfig.create({
        data: {
          key: 'engine_snapshot', version: DEFAULT_RATE_CONFIG.version, value: JSON.stringify(DEFAULT_RATE_CONFIG),
          notes: 'v3 Aug-2026: EV TT$400k ceiling (L.N. 479/2025 cl.4B, L.N. 613/2026), hybrid L.N. 247/2024, CNG 8y, returning nationals, excise 18/35, age limits 6y/10y. Edit via Settings → Rate Configuration.',
          effectiveFrom: new Date('2026-08-04'),
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
      vehicle: body.vehicle ? (body.vehicle as {
        fuel: 'petrol' | 'diesel' | 'ev' | 'hybrid' | 'cng'; engineCc: number; used: boolean;
        yearOfManufacture?: number; motorKw?: number;
        vehicleUse?: 'private' | 'commercial'; returningNational?: boolean;
      }) : undefined,
      containers: Array.isArray(body.containers) ? (body.containers as Array<'20ft' | '40ft' | '40hc' | 'lcl'>) : [],
      tyreCount: body.tyreCount ? Number(body.tyreCount) : undefined,
      isSingleUsePlastics: !!body.isSingleUsePlastics,
      isOnlinePurchase: !!body.isOnlinePurchase,
      config,
    });

    if (isPreview) {
      return ok({ result, calcId: null });
    }

    // Persist calculation (TT full engine)
    const calc = await db.costCalculation.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: (body.shipmentId as string) || null,
        name: String(body.name || `Calculation ${hs.code} ${new Date().toISOString().slice(0, 10)}`),
        hsCode: hs.code, mode: String(body.mode || 'sea'),
        fobUsd: result.cifUsd > 0 ? Number(body.fobUsd) : 0,
        freightUsd: Number(body.freightUsd) || 0,
        insuranceUsd: Number(body.insuranceUsd) || 0,
        exchangeRate: result.exchangeRate,
        regionCode: 'TT', regionCurrency: 'TTD',
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
