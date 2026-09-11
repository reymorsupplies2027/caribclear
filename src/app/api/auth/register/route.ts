import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { appendAuditLog } from '@/lib/audit';
import { checkRate, getIp } from '@/lib/rate-limit';

interface Body {
  email: string; password: string; name: string;
  companyName: string; companyType?: string;
}

export async function POST(req: NextRequest) {
  try {
    const rl = checkRate(`register:${getIp(req)}`, 5, 3_600_000);
    if (rl.limited) return fail(429, 'RATE_LIMITED', 'Too many registration attempts. Try later.');

    const body = await readJson<Body>(req);
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !body.password || !body.name || !body.companyName) {
      return fail(400, 'MISSING_FIELDS', 'Email, password, name and company name are required.');
    }
    if (body.password.length < 8) return fail(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');

    const exists = await db.user.findUnique({ where: { email } });
    if (exists) return fail(409, 'EMAIL_TAKEN', 'That email is already registered.');

    // slug from company name
    const baseSlug = body.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tenant';
    let slug = baseSlug;
    for (let i = 0; i < 20; i++) {
      if (!(await db.tenant.findUnique({ where: { slug } }))) break;
      slug = `${baseSlug}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    const tenant = await db.tenant.create({
      data: {
        name: body.companyName, slug,
        onboarding: JSON.stringify([
          { id: 'company', label: 'Company profile', done: true },
          { id: 'exchange_rate', label: 'Set TT$/USD exchange rate', done: false },
          { id: 'hs_codes', label: 'Review HS/CET rates', done: false },
          { id: 'first_shipment', label: 'Create first shipment', done: false },
          { id: 'invite_client', label: 'Invite an importer client', done: false },
        ]),
      },
    });

    const user = await db.user.create({
      data: {
        email, name: body.name, role: 'broker_admin', tenantId: tenant.id,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
    });

    await appendAuditLog({
      tenantId: tenant.id, userId: user.id, action: 'tenant.created',
      entityType: 'tenant', entityId: tenant.id,
      metadata: { companyName: body.companyName, plan: 'free' },
    });

    const res = ok({ tenant, user: { id: user.id, email, name: body.name, role: user.role } }, 201);
    setSessionCookie(res, createSessionToken(user.id, tenant.id));
    return res;
  } catch (err) { return guardError(err); }
}
