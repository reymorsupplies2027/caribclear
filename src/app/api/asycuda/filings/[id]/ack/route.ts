import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { parseCusres, assertTransition, STATUS_LABELS, type FilingStatus } from '@/lib/engine/asycuda';

interface AckBody {
  cusresXml?: string;            // optional: paste the portal's response XML
  registrationNumber?: string;   // e.g. "C 427"
  registrationDate?: string;     // YYYY-MM-DD
  assessmentNumber?: string;
  assessedTotal?: number;        // national currency
  receiptNumber?: string;
  paidAt?: string;
  status?: FilingStatus;         // optional explicit target (validated against the flow)
  note?: string;
}

/**
 * POST /api/asycuda/filings/[id]/ack — record the customs response (CUSRES)
 * on a filed declaration: registration number/date assigned by ASYCUDA on
 * validation, assessment (box B accounting) and payment receipt. Accepts a
 * pasted CUSRES XML (parsed tolerantly across administrations' tag variants),
 * manual fields, or both — manual fields win over parsed ones. The status move
 * must respect the real workflow: filed → registered → assessed → cleared.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff(req);
    const { id } = await params;
    const filing = await db.customsFiling.findUnique({ where: { id } });
    if (!filing) return fail(404, 'NOT_FOUND', 'Filing not found.');
    assertTenantOwns(s.tenantId, filing.tenantId);

    const body = await readJson<AckBody>(req);
    if (!body.cusresXml && !body.registrationNumber && !body.assessmentNumber && !body.receiptNumber && !body.status) {
      return fail(400, 'MISSING_FIELDS', 'Provide the CUSRES XML or at least one response field (registration number, assessment, receipt).');
    }

    const parsed = body.cusresXml ? parseCusres(body.cusresXml) : { recognized: false };
    const registrationNumber = body.registrationNumber || parsed.registrationNumber;
    const assessmentNumber = body.assessmentNumber || parsed.assessmentNumber;
    const receiptNumber = body.receiptNumber || parsed.receiptNumber;
    const assessedTotal = body.assessedTotal ?? parsed.totalAssessed;
    const registrationDate = body.registrationDate || parsed.registrationDate;
    const paidAt = body.paidAt || (receiptNumber ? new Date().toISOString() : undefined);

    // Derive the target status from what actually arrived (never invents a
    // state): explicit status (if legal) > receipt (paid) > assessment >
    // registration number > stay.
    const from = filing.status as FilingStatus;
    const to: FilingStatus = body.status || (receiptNumber ? 'cleared' : assessmentNumber || assessedTotal != null ? 'assessed' : registrationNumber ? 'registered' : from);
    if (from !== to) {
      try { assertTransition(from, to); }
      catch {
        return fail(422, 'BAD_TRANSITION', `The filing is "${STATUS_LABELS[from]}": recording "${STATUS_LABELS[to]}" skips the ASYCUDA workflow. Move it step by step (mark as filed first, then record the registration number).`);
      }
    }
    if (to === 'registered' && !registrationNumber) {
      return fail(422, 'MISSING_REGISTRATION', 'Registration number is required to mark the declaration as registered (ASYCUDA assigns it on validation, e.g. "C 427").');
    }

    const timeline: Array<{ status: string; at: string; byName: string; note?: string }> = [];
    try { timeline.push(...JSON.parse(filing.timelineJson || '[]')); } catch { /* reset timeline on corruption */ }
    timeline.push({
      status: to,
      at: new Date().toISOString(),
      byName: s.user.name || s.user.email || 'staff',
      note: body.note || (parsed.recognized ? 'CUSRES XML parsed and recorded.' : 'Customs response recorded manually.'),
    });

    const updated = await db.customsFiling.update({
      where: { id },
      data: {
        status: to,
        registrationNumber: registrationNumber ?? filing.registrationNumber,
        registrationDate: registrationDate ? new Date(registrationDate) : filing.registrationDate,
        assessmentNumber: assessmentNumber ?? filing.assessmentNumber,
        assessedTotal: assessedTotal ?? filing.assessedTotal,
        receiptNumber: receiptNumber ?? filing.receiptNumber,
        paidAt: paidAt ? new Date(paidAt) : filing.paidAt,
        timelineJson: JSON.stringify(timeline),
      },
    });

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'asycuda.cusres_recorded',
      entityType: 'customs_filing', entityId: id,
      metadata: { from, to, registrationNumber, assessmentNumber, receiptNumber, cusresParsed: parsed.recognized },
    });
    return ok({ filing: { ...updated, statusLabel: STATUS_LABELS[updated.status as FilingStatus] || updated.status }, cusresParsed: parsed.recognized });
  } catch (err) { return guardError(err); }
}
