import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireTenant, requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { assertTransition, ALLOWED_TRANSITIONS, STATUS_LABELS, FILING_STATUSES, type FilingStatus } from '@/lib/engine/asycuda';

interface PatchBody {
  status?: string;
  note?: string;
  office?: string;
  officeOfEntry?: string;
  declarationType?: string;
  currencyCode?: string;
  exchangeRate?: number;
  cpc?: string;
}

async function loadFiling(tenantId: string, id: string) {
  const filing = await db.customsFiling.findUnique({ where: { id } });
  if (!filing) throw Object.assign(new Error('Filing not found.'), { code: 'NOT_FOUND' });
  assertTenantOwns(tenantId, filing.tenantId);
  return filing;
}

/** GET — full filing detail (declaration snapshot + timeline). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireTenant(req);
    const { id } = await params;
    const filing = await loadFiling(s.tenantId, id).catch((e) => {
      if ((e as { code?: string }).code === 'NOT_FOUND') throw e;
      throw e;
    });
    return ok({ filing: { ...filing, statusLabel: STATUS_LABELS[filing.status as FilingStatus] || filing.status } });
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return fail(404, 'NOT_FOUND', 'Filing not found.');
    return guardError(err);
  }
}

/**
 * PATCH — staff transitions the filing through the ASYCUDA workflow
 * (mark as filed on the portal, reject/reset) and may edit lodgement fields
 * while the declaration has not yet been filed. Every change appends to the
 * tamper-evident timeline.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await params;
    const filing = await loadFiling(s.tenantId, id);
    const body = await readJson<PatchBody>(req);

    const data: Record<string, unknown> = {};
    const editable = ['office', 'officeOfEntry', 'declarationType', 'currencyCode'] as const;
    const preFiling = ['draft', 'validated', 'xml_generated'].includes(filing.status);
    if (preFiling) {
      for (const k of editable) if (body[k] !== undefined && body[k] !== '') data[k] = body[k];
      if (body.exchangeRate !== undefined && body.exchangeRate > 0) data.exchangeRate = body.exchangeRate;
      if (body.cpc !== undefined && body.cpc !== '') data.cpc = body.cpc;
    }

    let timeline: Array<{ status: string; at: string; byName: string; note?: string }> = [];
    try { timeline = JSON.parse(filing.timelineJson || '[]'); } catch { timeline = []; }

    if (body.status) {
      if (!FILING_STATUSES.includes(body.status as FilingStatus)) return fail(400, 'BAD_STATUS', `Unknown status "${body.status}".`);
      const to = body.status as FilingStatus;
      const from = filing.status as FilingStatus;
      if (from !== to) {
        try { assertTransition(from, to); }
        catch { return fail(422, 'BAD_TRANSITION', `Cannot move a filing from "${STATUS_LABELS[from]}" to "${STATUS_LABELS[to]}". Allowed next: ${(ALLOWED_TRANSITIONS[from]).map((x) => STATUS_LABELS[x]).join(', ') || 'none'}.`); }
      }
      data.status = to;
      timeline.push({ status: to, at: new Date().toISOString(), byName: s.user.name || s.user.email || 'staff', note: body.note || `Marked as ${STATUS_LABELS[to]} by the broker.` });
      data.timelineJson = JSON.stringify(timeline);
    } else if (Object.keys(data).length) {
      timeline.push({ status: filing.status, at: new Date().toISOString(), byName: s.user.name || s.user.email || 'staff', note: `Lodgement fields updated: ${Object.keys(data).join(', ')}.` });
      data.timelineJson = JSON.stringify(timeline);
    }

    if (!Object.keys(data).length) return fail(400, 'NOTHING_TO_UPDATE', 'Nothing to update — send status and/or editable fields.');

    const updated = await db.customsFiling.update({ where: { id }, data });
    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'asycuda.filing_updated',
      entityType: 'customs_filing', entityId: id,
      metadata: { status: data.status || filing.status, fields: Object.keys(data) },
    });
    return ok({ filing: { ...updated, statusLabel: STATUS_LABELS[updated.status as FilingStatus] || updated.status } });
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return fail(404, 'NOT_FOUND', 'Filing not found.');
    if ((err as { code?: string }).code === 'BAD_TRANSITION') return fail(422, 'BAD_TRANSITION', (err as Error).message);
    return guardError(err);
  }
}
