/**
 * CaribClear — Demurrage forecast route (POST /api/shipments/forecast).
 *
 * Builds REAL history rows from the tenant's released shipments
 * (clearance = released/closed − demurrageStart) and forecasts the requested
 * shipment (or every active shipment when no id is passed). Pure statistics,
 * tenant-scoped data, no external calls.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, assertTenantOwns } from '@/lib/guard';
import {
  forecastDemurrage, containerBucket,
  type HistoryRow, type ShipmentUnderForecast,
} from '@/lib/engine/demurrage-forecast';

interface ShipmentRow {
  id: string;
  reference: string;
  mode: string;
  status: string;
  originPort: string | null;
  destinationPort: string | null;
  demurrageFreeDays: number;
  demurragePerDayTtd: number;
  demurrageStartDate: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
  containers: { id: string }[];
  permits: { id: string; status: string }[];
}

function laneOf(s: { originPort: string | null; destinationPort: string | null }): string | null {
  if (!s.originPort || !s.destinationPort) return null;
  return `${s.originPort}→${s.destinationPort}`;
}

function releaseDate(s: ShipmentRow): Date | null {
  return s.closedAt ?? (s.status === 'released' ? s.updatedAt : null);
}

function clearanceDays(s: ShipmentRow): number | null {
  if (!s.demurrageStartDate) return null;
  const end = releaseDate(s);
  if (!end) return null;
  const days = (end.getTime() - s.demurrageStartDate.getTime()) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days > 365) return null; // data hygiene
  return Math.max(0.25, days);
}

function toHistory(rows: ShipmentRow[]): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const s of rows) {
    const d = clearanceDays(s);
    if (d === null) continue;
    out.push({
      clearanceDays: d,
      mode: s.mode,
      lane: laneOf(s),
      containerCount: s.containers.length,
    });
  }
  return out;
}

function toTarget(s: ShipmentRow): ShipmentUnderForecast {
  return {
    mode: s.mode,
    lane: laneOf(s),
    containerCount: s.containers.length,
    freeDays: s.demurrageFreeDays,
    perDayTtd: s.demurragePerDayTtd,
    demurrageStartIso: s.demurrageStartDate ? s.demurrageStartDate.toISOString() : null,
    status: s.status,
    hasPermitPending: s.permits.some(p => p.status === 'pending' || p.status === 'submitted'),
  };
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ shipmentId?: string }>(req);

    const select = {
      id: true, reference: true, mode: true, status: true,
      originPort: true, destinationPort: true,
      demurrageFreeDays: true, demurragePerDayTtd: true,
      demurrageStartDate: true, closedAt: true, updatedAt: true,
    } as const;

    // Released shipments feed the history (tenant-scoped)
    const released = await db.shipment.findMany({
      where: { tenantId: s.tenantId, status: 'released' },
      select: { ...select, containers: { select: { id: true } }, permits: { select: { id: true, status: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const history = toHistory(released as unknown as ShipmentRow[]);

    // Targets: the requested shipment, or all active ones
    let targets: ShipmentRow[];
    if (body.shipmentId) {
      const t = await db.shipment.findUnique({
        where: { id: body.shipmentId },
        select: { ...select, containers: { select: { id: true } }, permits: { select: { id: true, status: true } }, tenantId: true },
      });
      if (!t) return fail(404, 'NOT_FOUND', 'Shipment not found.');
      assertTenantOwns(s.tenantId, t.tenantId);
      targets = [t as unknown as ShipmentRow];
    } else {
      targets = await db.shipment.findMany({
        where: { tenantId: s.tenantId, status: { notIn: ['released'] } },
        select: { ...select, containers: { select: { id: true } }, permits: { select: { id: true, status: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }) as unknown as ShipmentRow[];
    }

    const forecasts = targets.map(t => {
      const f = forecastDemurrage(history, toTarget(t));
      return {
        shipmentId: t.id,
        reference: t.reference,
        status: t.status,
        forecast: f,
      };
    });

    return ok({
      forecasts,
      historySize: history.length,
      containerBuckets: [0, 1, 2].map(containerBucket), // sanity echo of the engine contract
    });
  } catch (err) { return guardError(err); }
}
