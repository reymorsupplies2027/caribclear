import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { checkRate, getIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sales/lead — public lead capture from the sales portal.
 * The prospect quantifies their own demurrage pain with the live calculator,
 * then saves it — the lead lands in the Control Tower with the number attached.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = checkRate(`lead:${getIp(req)}`, 5, 3600000); // 5/hour per IP
    if (rl.limited) return fail(429, 'RATE_LIMITED', `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.`);

    const body = await readJson<{
      name?: string; email?: string; company?: string; region?: string;
      exposureTtd?: number; message?: string;
    }>(req);
    if (!body.name || body.name.trim().length < 2) return fail(400, 'INVALID_NAME', 'Your name is required.');
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return fail(400, 'INVALID_EMAIL', 'A valid email is required.');
    const exposure = typeof body.exposureTtd === 'number' && body.exposureTtd >= 0 ? Math.round(body.exposureTtd * 100) / 100 : null;

    const lead = await db.lead.create({
      data: {
        name: body.name.trim().slice(0, 120),
        email: body.email.trim().toLowerCase().slice(0, 160),
        company: body.company?.trim().slice(0, 160) || null,
        region: body.region?.slice(0, 40) || null,
        exposureTtd: exposure,
        message: body.message?.trim().slice(0, 1000) || null,
      },
    });
    return ok({ saved: true, leadId: lead.id, exposureTtd: exposure }, 201);
  } catch (err) { return guardError(err); }
}
