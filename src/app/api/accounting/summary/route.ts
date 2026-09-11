/**
 * /api/accounting/summary — fiduciary overview for the accounting dashboard.
 * TRUST and OPERATING balances are computed SEPARATELY (never netted) and the
 * unbilled disbursement exposure is surfaced so operators know what outlays
 * still need to land on a client invoice.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, guardError } from '@/lib/api';
import { requireStaff } from '@/lib/guard';
import { fundTotals } from '@/lib/accounting';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const s = await requireStaff(req);
    const entries = await db.ledgerEntry.findMany({
      where: { tenantId: s.tenantId },
      select: { fund: true, direction: true, amount: true, currency: true },
    });
    const totals = fundTotals(entries);

    const [unbilled] = await Promise.all([
      db.disbursement.aggregate({
        where: { tenantId: s.tenantId, status: 'paid' },
        _count: { _all: true }, _sum: { amount: true },
      }),
    ]);

    const monthlyIncome = await db.ledgerEntry.findMany({
      where: {
        tenantId: s.tenantId, fund: 'OPERATING', direction: 'in',
        category: 'fee_income', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      select: { amount: true },
    });

    return ok({
      funds: { TRUST: totals.TRUST, OPERATING: totals.OPERATING },
      integrity: { foreignFundsFound: totals.foreignFundsFound, mixedCurrencies: totals.mixedCurrencies },
      unbilledDisbursements: { count: unbilled._count._all, total: unbilled._sum.amount || 0 },
      feeIncomeThisMonth: monthlyIncome.reduce((sum, e) => sum + e.amount, 0),
      presentationNote: 'TRUST balance is client money held on their behalf (liability). OPERATING is house money. Never netted.',
    });
  } catch (err) { return guardError(err); }
}
