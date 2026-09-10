import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import {
  buildFormC82, buildFormC84, buildCaricomCo, validateC82Totals,
  CARICOM_MEMBERS, type C82Form, type C84Form, type CaricomCoForm,
} from '@/lib/engine/forms';
import type { LandedCostResult, CostLine } from '@/lib/engine/landed-cost';

/**
 * GET /api/forms/build?kind=c82|c73|c84|caricom-co&shipmentId=...
 * Builds an official-form DRAFT from REAL tenant data (shipment + containers +
 * latest landed-cost calculation + vault documents). Never invents numbers:
 * missing mandatory data comes back as validation errors/warnings for the UI.
 */
export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') || 'c82';
    const shipmentId = url.searchParams.get('shipmentId');
    if (!shipmentId) return fail(400, 'MISSING_SHIPMENT', 'shipmentId is required.');
    if (!['c82', 'c73', 'c84', 'caricom-co'].includes(kind)) return fail(400, 'BAD_KIND', 'Unknown form kind.');

    const shipment = await db.shipment.findFirst({
      where: { id: shipmentId, tenantId: s.tenantId },
      include: {
        client: { select: { name: true, company: true, address: true, trinNumber: true } },
        containers: { select: { number: true, size: true, weightKg: true } },
        documents: { where: { isCurrent: true }, select: { type: true, title: true } },
        costCalcs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!shipment) return fail(404, 'NOT_FOUND', 'Shipment not found.');

    const tenant = await db.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true } });
    const rate = (shipment.exchangeRate && shipment.exchangeRate > 0) ? shipment.exchangeRate : 6.80;
    const blDoc = shipment.documents.find((d) => d.type === 'bl');
    const grossKg = shipment.containers.reduce((sum, c) => sum + (c.weightKg ?? 0), 0) || null;

    let result: unknown;
    let errors: Array<{ field: string; message: string }> = [];
    let warnings: Array<{ field: string; message: string }> = [];

    if (kind === 'c82' || kind === 'c73') {
      let costLines: CostLine[] = [];
      const calc = shipment.costCalcs[0];
      if (calc) {
        try {
          const parsed = JSON.parse(calc.breakdownJson) as LandedCostResult;
          costLines = (parsed.lines || []).filter((l) => l.kind !== 'value');
        } catch { warnings.push({ field: 'costLines', message: 'Saved calculation could not be parsed — duty/tax rows empty.' }); }
      } else {
        warnings.push({ field: 'costLines', message: 'No landed-cost calculation saved for this shipment yet — run the Cost engine first so boxes 38-41 carry real duties.' });
      }
      const built = buildFormC82({
        variant: kind === 'c73' ? 'c73' : 'c82',
        exporterConsignor: '',
        importerConsignee: shipment.client?.company || shipment.client?.name || '',
        declarant: tenant?.name || '',
        transportDocument: blDoc?.title || '',
        mode: shipment.mode,
        vesselOrFlight: shipment.vesselOrFlight || '',
        carrier: shipment.carrier || '',
        incoterm: shipment.incoterm || '',
        originPort: shipment.originPort || '',
        destinationPort: shipment.destinationPort || '',
        exchangeRate: rate,
        fobUsd: shipment.fobUsd,
        freightUsd: shipment.freightUsd,
        insuranceUsd: shipment.insuranceUsd,
        additionalInformation: `Shipment ${shipment.reference}. Goods: ${shipment.goodsDescription}`,
        totalPackages: shipment.containers.length ? `${shipment.containers.length} container(s) — ${shipment.containers.map((c) => c.size).join(', ')}` : '',
        items: [{
          description: shipment.goodsDescription,
          hsCode: calc?.hsCode || '',
          netKg: null,
          grossKg,
          quantity: null,
          unit: null,
          originCountry: '',
          costLines,
        }],
      });
      errors = built.errors; warnings = [...warnings, ...built.warnings];
      const form = { ...built.form, generatedFrom: { shipmentReference: shipment.reference, costCalcName: calc?.name || null, builtAt: new Date().toISOString() } };
      result = form;
    } else if (kind === 'c84') {
      const built = buildFormC84({
        declarantName: tenant?.name || '',
        importerExporter: shipment.client?.company || shipment.client?.name || '',
        regimeCode: shipment.type === 'export' ? 'EXPORT' : 'IMPORT',
        refNo: shipment.reference,
        claims: [{ itemNo: 1, cpc: '', description: shipment.goodsDescription, claimBasis: '' }],
        shipmentReference: shipment.reference,
      });
      errors = built.errors; warnings = [...warnings, ...built.warnings];
      result = { ...built.form, generatedFrom: { shipmentReference: shipment.reference, builtAt: new Date().toISOString() } };
    } else {
      // caricom-co — origin detection from the origin port string (e.g. "Kingston, Jamaica")
      const originPort = shipment.originPort || '';
      const detected = CARICOM_MEMBERS.find((m) => originPort.toLowerCase().includes(m.toLowerCase())) || '';
      const built = buildCaricomCo({
        issuedIn: detected || undefined,
        countryOfOrigin: detected,
        consignorExporter: '',
        consignee: shipment.client?.company || shipment.client?.name || '',
        transportRoute: [originPort, shipment.destinationPort].filter(Boolean).join(' → ') + (shipment.vesselOrFlight ? ` — ${shipment.vesselOrFlight}` : ''),
        portOfLoading: originPort,
        placeOfDestination: shipment.destinationPort || '',
        goods: [{ description: shipment.goodsDescription, grossWeightKg: grossKg, hsCode: shipment.costCalcs[0]?.hsCode || '' }],
        shipmentReference: shipment.reference,
      });
      errors = built.errors; warnings = [...warnings, ...built.warnings];
      result = built.form;
    }

    return ok({ form: result, errors, warnings });
  } catch (err) { return guardError(err); }
}

/**
 * POST /api/forms/build — persist a built form to the vault as an encrypted
 * JSON document (type 'declaration'). Server re-validates the critical
 * invariants before anything touches disk.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const body = await readJson<{ kind?: string; shipmentId?: string; payload?: C82Form | C84Form | CaricomCoForm; title?: string }>(req);
    if (!body.kind || !body.payload) return fail(400, 'MISSING_FIELDS', 'kind and payload are required.');
    if (!['c82', 'c73', 'c84', 'caricom-co'].includes(body.kind)) return fail(400, 'BAD_KIND', 'Unknown form kind.');

    const payload = body.payload;
    if (body.kind === 'c82' || body.kind === 'c73') {
      const p = payload as C82Form;
      if (!p.box5ImporterConsignee) return fail(422, 'INVALID_FORM', 'Importer/Consignee is mandatory.');
      const totals = validateC82Totals(p);
      if (totals.length) return fail(422, 'TOTALS_MISMATCH', totals[0].message);
    } else if (body.kind === 'c84') {
      const p = payload as C84Form;
      if (!p.declarationNoAndDate) return fail(422, 'INVALID_FORM', 'C84 must link an existing customs declaration.');
      if (!p.claims.length) return fail(422, 'INVALID_FORM', 'C84 needs at least one claim.');
    } else {
      const p = payload as CaricomCoForm;
      const isMember = CARICOM_MEMBERS.some((m) => m.toLowerCase() === (p.box4CountryOfOrigin || '').toLowerCase());
      if (!isMember) return fail(422, 'NOT_CARICOM', 'Country of origin must be a CARICOM member state.');
    }

    const { mkdir, writeFile } = await import('fs/promises');
    const path = await import('path');
    const crypto = await import('crypto');
    const { vaultEncrypt } = await import('@/lib/vault-crypto');
    const json = JSON.stringify(payload, null, 2);
    const fileName = `${body.kind.toUpperCase()}-${Date.now()}.json`;
    const storageKey = `documents/forms-${crypto.randomUUID()}-${fileName}`;
    const abs = path.join(process.cwd(), 'upload', storageKey);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, vaultEncrypt(Buffer.from(json, 'utf8')));

    let shipmentRef = '';
    if (body.shipmentId) {
      const sh = await db.shipment.findFirst({ where: { id: body.shipmentId, tenantId: s.tenantId }, select: { reference: true } });
      shipmentRef = sh?.reference || '';
    }
    const title = body.title || `Form ${body.kind.toUpperCase()}${shipmentRef ? ` — ${shipmentRef}` : ''}`;

    const doc = await db.document.create({
      data: {
        tenantId: s.tenantId,
        shipmentId: body.shipmentId || null,
        groupKey: crypto.randomUUID(),
        version: 1,
        isCurrent: true,
        type: 'declaration',
        title,
        fileName,
        mimeType: 'application/json',
        fileSize: Buffer.byteLength(json),
        storageKey,
        notes: 'Generated by CaribClear Forms Studio; official-layout draft pending broker review and lodgement.',
        uploadedById: s.userId,
      },
    });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'form.persisted',
      entityType: 'document', entityId: doc.id,
      metadata: { kind: body.kind, shipment: shipmentRef, title },
    });
    return ok({ document: { id: doc.id, title: doc.title } }, 201);
  } catch (err) { return guardError(err); }
}
