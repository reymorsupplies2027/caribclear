/**
 * CaribClear — ASYCUDA e-filing service (server-side).
 *
 * Single assembly path shared by /api/asycuda/validate and /api/asycuda/generate
 * so the validated payload and the generated XML can never drift apart.
 * Everything comes from REAL tenant data: shipment, client (consignee/TIN),
 * containers, the latest saved landed-cost calculation (duty/tax rows) and the
 * tenant (declarant). The engine NEVER invents data — missing mandatory fields
 * come back as validation errors for the operator to fix.
 */
import { db } from '@/lib/db';
import type { CostLine, LandedCostResult } from '@/lib/engine/landed-cost';
import { CARICOM_MEMBERS } from '@/lib/engine/forms';
import {
  buildAsycudaDeclaration,
  type AsycudaBuildInput,
  type AsycudaDeclaration,
  type FormIssue,
} from '@/lib/engine/asycuda';
import { getRegion } from '@/lib/engine/customs-regions';

export interface AssembleOptions {
  country: string;
  office?: string;
  officeOfEntry?: string;
  declarationType?: string;
  currencyCode?: string;
  exchangeRate?: number;
  locationOfGoods?: string;
  deferredPaymentAccount?: string;
}

export interface AssembledDeclaration {
  declaration: AsycudaDeclaration;
  errors: FormIssue[];
  warnings: FormIssue[];
  context: {
    tenantName: string;
    shipmentReference: string;
    costCalcName: string | null;
    regionCurrency: string;
    suggestedOffice: string;
  };
}

export class UnknownRegionError extends Error {}

export async function assembleDeclarationForShipment(
  tenantId: string,
  shipmentId: string,
  opts: AssembleOptions,
): Promise<AssembledDeclaration> {
  const region = getRegion(opts.country);
  if (!region) throw new UnknownRegionError(`Unknown customs region "${opts.country}".`);

  const shipment = await db.shipment.findFirst({
    where: { id: shipmentId, tenantId },
    include: {
      client: { select: { name: true, company: true, address: true, trinNumber: true } },
      containers: { select: { number: true, size: true, weightKg: true } },
      costCalcs: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!shipment) throw Object.assign(new Error('Shipment not found.'), { code: 'NOT_FOUND' });

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const tenantName = tenant?.name || '';

  const warnings: FormIssue[] = [];
  let costLines: CostLine[] = [];
  const calc = shipment.costCalcs[0];
  if (calc) {
    try {
      const parsed = JSON.parse(calc.breakdownJson) as LandedCostResult;
      costLines = (parsed.lines || []).filter((l) => l.kind !== 'value');
    } catch {
      warnings.push({ field: 'costLines', message: 'Saved calculation could not be parsed — duty/tax rows (box 47) empty. Run the Cost engine again.' });
    }
  } else {
    warnings.push({ field: 'costLines', message: 'No landed-cost calculation saved for this shipment yet — run the Cost engine first so box 47 carries real duties.' });
  }

  // TTD default FX comes from the tenant profile (TTD per USD, TT-calibrated).
  // Other countries require the operator to enter the current official rate.
  let exchangeRate = opts.exchangeRate && opts.exchangeRate > 0 ? opts.exchangeRate : (shipment.exchangeRate ?? undefined);
  if (!exchangeRate && region.code === 'TT') {
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { defaultExchangeRate: true } });
    exchangeRate = t?.defaultExchangeRate || undefined;
  }

  const grossKg = shipment.containers.reduce((sum, c) => sum + (c.weightKg ?? 0), 0) || null;
  const containerNumbers = shipment.containers.map((c) => c.number).filter(Boolean).join(', ');
  const packagesLabel = shipment.containers.length
    ? `${shipment.containers.length} container(s) — ${shipment.containers.map((c) => c.size).join(', ')}`
    : '';
  const originPort = shipment.originPort || '';
  const originCountry = CARICOM_MEMBERS.find((m) => originPort.toLowerCase().includes(m.toLowerCase())) || '';
  const blDoc = await db.document.findFirst({
    where: { tenantId, shipmentId, type: 'bl', isCurrent: true },
    select: { title: true },
  });

  const input: AsycudaBuildInput = {
    country: region.code,
    shipmentReference: shipment.reference,
    office: opts.office || '',
    officeOfEntry: opts.officeOfEntry || opts.office || '',
    declarationType: opts.declarationType || (shipment.type === 'export' ? 'EX1' : 'IM4'),
    consigneeCode: shipment.client?.trinNumber || '',
    consigneeNameAddress: [shipment.client?.company || shipment.client?.name || '', shipment.client?.address || ''].filter(Boolean).join(' — '),
    exporterNameAddress: '',
    declarantName: tenantName,
    incoterm: shipment.incoterm || '',
    incotermPlace: originPort,
    currencyCode: opts.currencyCode || 'USD',
    exchangeRate: exchangeRate ?? 0,
    mode: shipment.mode,
    vesselOrFlight: shipment.vesselOrFlight || '',
    originPort,
    destinationPort: shipment.destinationPort || '',
    locationOfGoods: opts.locationOfGoods || shipment.destinationPort || '',
    totalPackages: packagesLabel,
    transportDocument: blDoc?.title || '',
    deferredPaymentAccount: opts.deferredPaymentAccount || '',
    items: [{
      description: shipment.goodsDescription,
      hsCode: calc?.hsCode || '',
      netKg: null,
      grossKg,
      packagesCount: shipment.containers.length || null,
      kindOfPackages: shipment.containers.length === 1 ? `container ${shipment.containers[0].size}` : 'containers',
      containerNumber: containerNumbers,
      originCountry,
      costLines,
      fobLineUsd: shipment.fobUsd,
    }],
  };
  if (!exchangeRate) warnings.push({ field: 'boxExchangeRate', message: `Enter the current official ${region.currency}/USD rate — it is required to value the declaration (box 23).` });

  const build = buildAsycudaDeclaration(input);
  return {
    declaration: build.declaration,
    errors: build.errors,
    warnings: [...warnings, ...build.warnings],
    context: {
      tenantName,
      shipmentReference: shipment.reference,
      costCalcName: calc?.name || null,
      regionCurrency: region.currency,
      suggestedOffice: shipment.destinationPort || '',
    },
  };
}
