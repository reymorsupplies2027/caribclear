'use client';

/**
 * LegalTooltip — ⓘ hover/focus tooltip with the legal calculation basis
 * behind each landed-cost line (Customs Act Cap 78:01 & related laws).
 * Content mirrors the engine formulas in src/lib/engine/landed-cost.ts.
 */
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const LEGAL_NOTES: Record<string, { title: string; basis: string }> = {
  cif: {
    title: 'CIF value — valuation basis',
    basis: '(FOB + Freight + Insurance) in USD × exchange rate (TT$/USD). Valuation follows the Customs Act Chap 78:01 (Section 35 & Schedule, WTO/GATT Article VII transaction-value method).',
  },
  duty: {
    title: 'Import Duty (CET)',
    basis: 'CIF (TT$) × CET rate of the tariff code. Legal basis: First Schedule — Customs (Tariff) Order, Customs Act Chap 78:01, applying the CARICOM Common External Tariff band of the HS heading.',
  },
  mvt: {
    title: 'Motor Vehicle Tax (MVT)',
    basis: 'Engine displacement (cc) × TT$ per cc. Legal basis: Fourth Schedule, Motor Vehicles and Road Traffic Act Chap 48:50. Foreign-used vehicles pay 75% of the MVT (used-vehicle factor).',
  },
  vat: {
    title: 'VAT 12.5%',
    basis: '(CIF + Import Duty + MVT where applicable) × 12.5%. Legal basis: Value Added Tax Act Chap 75:06 (standard rate, Second Schedule lists exemptions); collected at import by the Customs & Excise Division under Chap 78:01.',
  },
  fees: {
    title: 'Customs fees (2026 schedule)',
    basis: 'Entry/declaration fee TT$80 + container examination fee (20ft TT$750 / 40ft TT$1,050). Legal basis: Customs (Fees) Order under Chap 78:01 — 2026 fee schedule.',
  },
  environmental: {
    title: 'Environmental levies',
    basis: 'Tyre tax TT$40 per tyre (HS 4011) and 5% single-use plastics levy on CIF (HS 3923). Legal basis: FY2026 national budget measures under the Customs Act Chap 78:01.',
  },
  online: {
    title: 'Online purchase tax 7%',
    basis: '7% applied on CIF for goods bought through overseas online platforms. Legal basis: excise measure on low-value online imports, administered at entry under Chap 78:01.',
  },
};

export function LegalTooltip({ lineKey, className }: { lineKey: string; className?: string }) {
  const note = LEGAL_NOTES[lineKey];
  if (!note) return null;
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Legal basis: ${note.title}`}
            className={cn('inline-flex items-center align-middle text-muted-foreground/70 hover:text-teal-600 transition-colors cursor-help', className)}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-xs p-3">
          <p className="text-xs font-bold mb-1">{note.title}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{note.basis}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
