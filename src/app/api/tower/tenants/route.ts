import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['sailed', 'in_transit', 'arrived', 'unloaded', 'in_customs'];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function generateTempPassword(): string {
  const words = ['Harbor', 'Cargo', 'Coral', 'Trade', 'Anchor', 'Marina', 'Tide', 'Reef', 'Sail', 'Dock'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  const s = '!$#%&*'[Math.floor(Math.random() * 5)];
  return `${w}${n}${s}cc`;
}

/** GET /api/tower/tenants — landlord's tenant book, filterable by region/plan/status/search. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const sp = req.nextUrl.searchParams;
    const region = sp.get('region') || '';
    const plan = sp.get('plan') || '';
    const status = sp.get('status') || ''; // active | suspended
    const q = (sp.get('q') || '').trim().toLowerCase();

    const tenants = await db.tenant.findMany({
      include: {
        users: { select: { id: true, lastLogin: true, isActive: true } },
        shipments: { select: { id: true, status: true, updatedAt: true } },
        invoices: { select: { amount: true, status: true, paidAt: true, dueDate: true, period: true } },
        documents: { select: { id: true, fileSize: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    let rows = tenants.map(t => {
      const activeShipments = t.shipments.filter(s => ACTIVE_STATUSES.includes(s.status)).length;
      const paidInv = t.invoices.filter(i => i.status === 'paid');
      const pendingInv = t.invoices.filter(i => i.status === 'pending');
      const overdueInv = t.invoices.filter(i => i.status === 'overdue');
      const lastShipmentActivity = t.shipments.reduce((m, s) => Math.max(m, new Date(s.updatedAt).getTime()), 0);
      const lastLogin = t.users.reduce((m, u) => Math.max(m, u.lastLogin ? new Date(u.lastLogin).getTime() : 0), 0);
      const lastActivity = Math.max(lastShipmentActivity, lastLogin, new Date(t.updatedAt).getTime());
      const activityDays = Math.floor((now - lastActivity) / 86400000);
      const activityState = activityDays <= 2 ? 'green' : activityDays <= 7 ? 'amber' : 'red';
      return {
        id: t.id, name: t.name, slug: t.slug, plan: t.plan, priceUsd: t.priceUsd,
        region: t.region, city: t.city, contactEmail: t.contactEmail,
        isActive: t.isActive, createdAt: t.createdAt, trialEndsAt: t.trialEndsAt,
        subscriptionEndsAt: t.subscriptionEndsAt,
        users: t.users.length, activeUsers: t.users.filter(u => u.isActive).length,
        shipments: t.shipments.length, activeShipments,
        documents: t.documents.length, storageBytes: t.documents.reduce((s, d) => s + d.fileSize, 0),
        invoicesPaid: paidInv.length, invoicesPending: pendingInv.length, invoicesOverdue: overdueInv.length,
        lastPayment: paidInv.length ? paidInv.map(i => i.paidAt).sort().at(-1) : null,
        activityDays, activityState,
      };
    });

    if (region) rows = rows.filter(t => t.region === region);
    if (plan) rows = rows.filter(t => t.plan === plan);
    if (status === 'active') rows = rows.filter(t => t.isActive);
    if (status === 'suspended') rows = rows.filter(t => !t.isActive);
    if (q) rows = rows.filter(t => t.name.toLowerCase().includes(q) || t.city?.toLowerCase().includes(q) || t.slug.includes(q));

    return ok({ tenants: rows });
  } catch (err) { return guardError(err); }
}

/** POST /api/tower/tenants — onboard a new tenant (wizard endpoint). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const body = await readJson<{
      name?: string; region?: string; city?: string; plan?: string;
      contactEmail?: string; adminName?: string; adminEmail?: string; notes?: string;
    }>(req);
    if (!body.name || !body.adminEmail || !body.adminName) {
      return fail(400, 'MISSING_FIELDS', 'name, adminName and adminEmail are required.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.adminEmail)) {
      return fail(400, 'INVALID_EMAIL', 'Admin email is not valid.');
    }
    const existingUser = await db.user.findUnique({ where: { email: body.adminEmail } });
    if (existingUser) return fail(409, 'EMAIL_TAKEN', 'That email already has an account.');

    let slug = slugify(body.name);
    if (!slug) slug = `tenant-${Date.now()}`;
    const slugTaken = await db.tenant.findUnique({ where: { slug } });
    if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;

    const tempPassword = generateTempPassword();
    const tenant = await db.tenant.create({
      data: {
        name: body.name, slug, plan: body.plan === 'pro' ? 'pro' : 'free',
        region: body.region || 'Trinidad', city: body.city || null,
        contactEmail: body.contactEmail || body.adminEmail, notes: body.notes || null,
        trialEndsAt: body.plan === 'pro' ? null : new Date(Date.now() + 14 * 86400000),
      },
    });
    const adminUser = await db.user.create({
      data: {
        email: body.adminEmail, name: body.adminName, role: 'broker_admin',
        tenantId: tenant.id, passwordHash: await bcrypt.hash(tempPassword, 10),
      },
    });
    await appendAuditLog({
      tenantId: tenant.id, userId: admin.userId, action: 'tower.tenant_created',
      entityType: 'tenant', entityId: tenant.id,
      metadata: { name: body.name, region: body.region, plan: body.plan ?? 'free', adminEmail: body.adminEmail },
    });
    return ok({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, region: tenant.region },
      credentials: { adminEmail: adminUser.email, tempPassword },
    }, 201);
  } catch (err) { return guardError(err); }
}
