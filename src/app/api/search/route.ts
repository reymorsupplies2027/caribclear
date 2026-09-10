import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { checkRate, getIp } from '@/lib/rate-limit';

/**
 * GET /api/search?q=...
 * Universal operator search across the whole workspace. One query, every
 * entity: shipments, vault documents, clients, HS/CET codes, quotes &
 * invoices, cost calculations. Tenant-scoped at every query (RLS belt and
 * braces on top of requireTenant).
 *
 * Ranking (transparent, deterministic):
 *   exact match on identifiers (reference/number/code)  > startsWith > contains
 * Groups are returned separately so the UI renders them in fixed order.
 */

export interface SearchHit {
  id: string;
  group: 'shipments' | 'documents' | 'clients' | 'hs' | 'quotes' | 'costs';
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return ok({ hits: [], q });

    const rl = checkRate(`search:${s.tenantId}:${getIp(req)}`, 90, 60_000);
    if (rl.limited) return fail(429, 'RATE_LIMITED', 'Too many searches — slow down.');

    const ql = q.toLowerCase();
    const take = 6;
    const [shipments, documents, clients, hsCodes, quotes, costs] = await Promise.all([
      db.shipment.findMany({
        where: {
          tenantId: s.tenantId,
          OR: [
            { reference: { contains: q } }, { goodsDescription: { contains: q } },
            { carrier: { contains: q } }, { vesselOrFlight: { contains: q } },
            { originPort: { contains: q } }, { destinationPort: { contains: q } },
            { statusNote: { contains: q } }, { client: { is: { name: { contains: q } } } },
            { client: { is: { company: { contains: q } } } },
          ],
        },
        include: { client: { select: { name: true, company: true } } },
        orderBy: { updatedAt: 'desc' }, take,
      }),
      db.document.findMany({
        where: {
          tenantId: s.tenantId, isCurrent: true,
          OR: [{ title: { contains: q } }, { fileName: { contains: q } }, { notes: { contains: q } }, { type: { contains: q } }],
        },
        include: { shipment: { select: { reference: true } } },
        orderBy: { createdAt: 'desc' }, take,
      }),
      db.client.findMany({
        where: {
          tenantId: s.tenantId,
          OR: [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }, { trinNumber: { contains: q } }],
        },
        orderBy: { updatedAt: 'desc' }, take,
      }),
      db.hsCode.findMany({
        where: { OR: [{ code: { contains: q } }, { description: { contains: q } }] },
        orderBy: { code: 'asc' }, take,
      }),
      db.quote.findMany({
        where: {
          tenantId: s.tenantId,
          OR: [{ number: { contains: q } }, { notes: { contains: q } }, { client: { is: { name: { contains: q } } } }],
        },
        include: { client: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' }, take,
      }),
      db.costCalculation.findMany({
        where: { tenantId: s.tenantId, OR: [{ name: { contains: q } }, { hsCode: { contains: q } }] },
        orderBy: { createdAt: 'desc' }, take,
      }),
    ]);

    const hits: SearchHit[] = [];

    for (const sh of shipments) {
      hits.push({
        id: sh.id, group: 'shipments', title: sh.reference,
        subtitle: `${sh.client?.company || sh.client?.name || 'No client'} · ${sh.goodsDescription.slice(0, 60)}${sh.goodsDescription.length > 60 ? '…' : ''}`,
        badge: sh.status.replace(/_/g, ' '), href: `/dashboard/shipments?q=${encodeURIComponent(sh.reference)}`,
      });
    }
    for (const d of documents) {
      hits.push({
        id: d.id, group: 'documents', title: d.title,
        subtitle: `${d.fileName}${d.shipment ? ` · ${d.shipment.reference}` : ''} · v${d.version}`,
        badge: d.type.replace(/_/g, ' '), href: '/dashboard/documents',
      });
    }
    for (const c of clients) {
      hits.push({
        id: c.id, group: 'clients', title: c.company || c.name,
        subtitle: [c.name !== (c.company || c.name) ? c.name : null, c.email, c.trinNumber ? `TRIN ${c.trinNumber}` : null].filter(Boolean).join(' · '),
        href: '/dashboard/clients',
      });
    }
    for (const hs of hsCodes) {
      hits.push({
        id: hs.id, group: 'hs', title: hs.code,
        subtitle: hs.description.slice(0, 80), badge: `CET ${hs.cetRate}%`,
        href: `/dashboard/hs-codes?q=${encodeURIComponent(hs.code)}`,
      });
    }
    for (const qt of quotes) {
      hits.push({
        id: qt.id, group: 'quotes', title: qt.number,
        subtitle: `${qt.type === 'invoice' ? 'Invoice' : 'Quote'} · ${qt.client?.name || 'No client'} · ${qt.status}`,
        badge: qt.status, href: '/dashboard/quotes',
      });
    }
    for (const cc of costs) {
      hits.push({
        id: cc.id, group: 'costs', title: cc.name,
        subtitle: `HS ${cc.hsCode} · CIF TT$${Math.round(cc.cifTtd).toLocaleString('en-US')} · total TT$${Math.round(cc.totalTtd).toLocaleString('en-US')}`,
        href: '/dashboard/calculator',
      });
    }

    // Deterministic ranking: identifier-exact first, then group order.
    const groupOrder: Record<SearchHit['group'], number> = { shipments: 0, documents: 1, clients: 2, hs: 3, quotes: 4, costs: 5 };
    const exactBonus = (h: SearchHit) => (h.title.toLowerCase() === ql ? 100 : h.title.toLowerCase().startsWith(ql) ? 50 : 0);
    hits.sort((a, b) => (exactBonus(b) - exactBonus(a)) || (groupOrder[a.group] - groupOrder[b.group]));

    return ok({ hits: hits.slice(0, 30), q, total: hits.length });
  } catch (err) { return guardError(err); }
}
