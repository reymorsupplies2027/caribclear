import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ok, fail, guardError, readJson } from '@/lib/api';
import { requireStaff, requireBrokerAdmin, assertTenantOwns } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const clients = await db.client.findMany({
      where: { tenantId: s.tenantId },
      include: {
        shipments: { select: { id: true, status: true, reference: true } },
        users: { select: { id: true, email: true, isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ clients });
  } catch (err) { return guardError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const body = await readJson<{ name: string; email?: string; phone?: string; company?: string; trinNumber?: string; address?: string; createPortalAccess?: boolean }>(req);
    if (!body.name) return fail(400, 'MISSING_FIELDS', 'Client name is required.');

    const client = await db.client.create({
      data: {
        tenantId: s.tenantId, name: body.name,
        email: body.email || null, phone: body.phone || null,
        company: body.company || null, trinNumber: body.trinNumber || null,
        address: body.address || null,
      },
    });

    // Portal access: create importer user with a temporary password
    let portalCredentials: { email: string; tempPassword: string } | null = null;
    if (body.createPortalAccess && body.email) {
      const exists = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (exists) {
        await db.client.delete({ where: { id: client.id } });
        return fail(409, 'EMAIL_TAKEN', 'That email already has an account. Use a different one.');
      }
      const tempPassword = `CC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const user = await db.user.create({
        data: {
          email: body.email.toLowerCase(), name: body.name, role: 'importer',
          tenantId: s.tenantId, clientId: client.id,
          passwordHash: await bcrypt.hash(tempPassword, 10),
        },
      });
      portalCredentials = { email: user.email, tempPassword };
    }

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'client.created',
      entityType: 'client', entityId: client.id,
      metadata: { name: body.name, portalAccess: !!portalCredentials },
    });
    return ok({ client, portalCredentials }, 201);
  } catch (err) { return guardError(err); }
}

export async function DELETE(req: NextRequest) {
  try {
    const s = await requireBrokerAdmin(req);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return fail(400, 'MISSING_ID', 'id required.');
    const client = await db.client.findUnique({ where: { id } });
    if (!client) return fail(404, 'NOT_FOUND', 'Client not found.');
    assertTenantOwns(s.tenantId, client.tenantId);
    await db.client.delete({ where: { id } });
    await appendAuditLog({ tenantId: s.tenantId, userId: s.userId, action: 'client.deleted', entityType: 'client', entityId: id, metadata: { name: client.name } });
    return ok({ deleted: true });
  } catch (err) { return guardError(err); }
}

import crypto from 'crypto';
