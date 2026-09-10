import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { round2 } from '@/lib/engine/landed-cost';
import type { LandedCostResult } from '@/lib/engine/landed-cost';

/**
 * GET /api/reports/summary?days=90
 * Real aggregation over the tenant's own data — executive KPIs, demurrage
 * exposure, top clients and HS usage. No sampling, no synthetic numbers.
 *
 * GET /api/reports/summary?kind=certificate&calcId=...
 * Premium landed-cost certificate payload for one saved calculation
 * (breakdown lines + legal instruments + rate snapshot).
 */

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') || 'summary';

    if (kind === 'certificate') {
      const calcId = url.searchParams.get('calcId');
      if (!calcId) return fail(400, 'MISSING_ID', 'calcId is required.');
      const calc = await db.costCalculation.findFirst({
        where: { id: calcId, tenantId: s.tenantId },
        include: {
          shipment: { select: { reference: true, goodsDescription: true, client: { select: { name: true, company: true } } } },
        },
      });
      if (!calc) return fail(404, 'NOT_FOUND', 'Calculation not found.');
      let breakdown: LandedCostResult | null = null;
      let configVersion: unknown = null;
      try {
        breakdown = JSON.parse(calc.breakdownJson) as LandedCostResult;
        configVersion = JSON.parse(calc.configJson);
      } catch { /* certificate renders from stored columns if JSON unreadable */ }
      return ok({
        certificate: {
          id: calc.id,
          name: calc.name,
          hsCode: calc.hsCode,
          mode: calc.mode,
          fobUsd: calc.fobUsd, freightUsd: calc.freightUsd, insuranceUsd: calc.insuranceUsd,
          exchangeRate: calc.exchangeRate,
          cifTtd: calc.cifTtd, totalTtd: calc.totalTtd,
          configVersion,
          breakdown,
          createdAt: calc.createdAt,
          shipment: calc.shipment,
        },
      });
    }

    // — summary —
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '90', 10) || 90, 7), 365);
    const since = new Date(Date.now() - days * 86400000);
    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true, defaultExchangeRate: true } });
    const fx = tenant?.defaultExchangeRate || 6.80;

    const [shipments, costCalcs, docCount, quotes] = await Promise.all([
      db.shipment.findMany({
        where: { tenantId: s.tenantId, createdAt: { gte: since } },
        include: { client: { select: { name: true, company: true } }, containers: { select: { weightKg: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.costCalculation.findMany({ where: { tenantId: s.tenantId, createdAt: { gte: since } } }),
      db.document.count({ where: { tenantId: s.tenantId, isCurrent: true } }),
      db.quote.findMany({ where: { tenantId: s.tenantId, createdAt: { gte: since } } }),
    ]);

    const byStatus: Record<string, number> = {};
    let cifTtd = 0, dutiesTtd = 0, taxesTtd = 0, demurrageExposureTtd = 0, totalGrossKg = 0;
    const clientTotals = new Map<string, { cif: number; count: number }>();
    const demurrageRows: Array<{ reference: string; client: string; daysLate: number; freeDays: number; perDayTtd: number; exposureTtd: number; status: string; startDate: string | null }> = [];
    const now = Date.now();

    for (const sh of shipments) {
      const rate = sh.exchangeRate && sh.exchangeRate > 0 ? sh.exchangeRate : fx;
      const cif = round2((sh.fobUsd + sh.freightUsd + sh.insuranceUsd) * rate);
      cifTtd += cif;
      totalGrossKg += sh.containers.reduce((sum, c) => sum + (c.weightKg ?? 0), 0);
      byStatus[sh.status] = (byStatus[sh.status] || 0) + 1;
      const cname = sh.client?.company || sh.client?.name || 'Unassigned';
      const prev = clientTotals.get(cname) || { cif: 0, count: 0 };
      clientTotals.set(cname, { cif: prev.cif + cif, count: prev.count + 1 });

      if (sh.demurrageStartDate && !['released', 'closed'].includes(sh.status)) {
        const start = new Date(sh.demurrageStartDate).getTime();
        const daysLate = Math.max(0, Math.floor((now - start) / 86400000) - sh.demurrageFreeDays);
        const exposure = round2(daysLate * sh.demurragePerDayTtd);
        demurrageExposureTtd += exposure;
        if (daysLate > 0 || ['arrived', 'unloaded', 'in_customs'].includes(sh.status)) {
          demurrageRows.push({
            reference: sh.reference, client: cname, daysLate, freeDays: sh.demurrageFreeDays,
            perDayTtd: sh.demurragePerDayTtd, exposureTtd: exposure, status: sh.status,
            startDate: sh.demurrageStartDate ? new Date(sh.demurrageStartDate).toISOString() : null,
          });
        }
      }
    }

    const hsUsage = new Map<string, { name: string; count: number; totalTtd: number }>();
    for (const cc of costCalcs) {
      taxesTtd += round2(cc.totalTtd - cc.cifTtd);
      let duty = 0;
      try {
        const b = JSON.parse(cc.breakdownJson) as LandedCostResult;
        duty = round2((b.dutyTtd || 0) + (b.mvtTtd || 0) + (b.exciseTtd || 0));
      } catch { /* fall back to 0 for this calc only */ }
      dutiesTtd += duty;
      const prev = hsUsage.get(cc.hsCode) || { name: cc.name, count: 0, totalTtd: 0 };
      hsUsage.set(cc.hsCode, { name: prev.name, count: prev.count + 1, totalTtd: round2(prev.totalTtd + cc.totalTtd) });
    }

    const quotesApproved = quotes.filter((q) => q.status === 'approved' || q.status === 'paid');
    const quotesTotal = quotes.reduce((sum, q) => sum + q.total, 0);

    return ok({
      summary: {
        tenantName: tenant?.name || '',
        periodDays: days,
        since: since.toISOString(),
        generatedAt: new Date().toISOString(),
        shipmentsCount: shipments.length,
        byStatus,
        cifTtd: round2(cifTtd),
        dutiesTtd: round2(dutiesTtd),
        taxesTotalTtd: round2(taxesTtd),
        calcCount: costCalcs.length,
        documentsCount: docCount,
        quotesCount: quotes.length,
        quotesApprovedCount: quotesApproved.length,
        quotesTotalTtd: round2(quotesTotal),
        totalGrossKg: round2(totalGrossKg),
        demurrageExposureTtd: round2(demurrageExposureTtd),
        demurrageRows: demurrageRows.sort((a, b) => b.exposureTtd - a.exposureTtd).slice(0, 20),
        topClients: [...clientTotals.entries()].sort((a, b) => b[1].cif - a[1].cif).slice(0, 8)
          .map(([name, v]) => ({ name, cifTtd: round2(v.cif), count: v.count })),
        topHs: [...hsUsage.entries()].sort((a, b) => b[1].totalTtd - a[1].totalTtd).slice(0, 8)
          .map(([code, v]) => ({ code, count: v.count, totalTtd: v.totalTtd })),
      },
    });
  } catch (err) { return guardError(err); }
}
