'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Scale, ExternalLink, BookOpen, ArrowRight } from 'lucide-react';
import { LEGAL_LIBRARY, CATEGORY_LABELS, filterLegalLibrary, type LegalCategory } from '@/lib/engine/legal-library';

/**
 * Legal Library (Libro de leyes) — a consultable index of the instruments
 * that govern the broker's daily work: what each one governs, its practical
 * effect on the operator's actions, and the official source to verify.
 * Reference aid, not legal advice — the authoritative text is laws.gov.tt.
 */

const CATEGORIES: Array<{ id: LegalCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  ...(Object.entries(CATEGORY_LABELS) as Array<[LegalCategory, string]>).map(([id, label]) => ({ id, label })),
];

export default function LegalLibraryPage() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<LegalCategory | 'all'>('all');

  const results = useMemo(() => filterLegalLibrary(LEGAL_LIBRARY, q, cat), [q, cat]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Scale className="h-6 w-6 text-teal-600" /> Legal library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The instruments behind every calculation and form — what each one governs, its practical effect, and where to verify the official text.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1"><BookOpen className="h-3 w-3" /> {results.length} of {LEGAL_LIBRARY.length}</Badge>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search by law, notice, topic — e.g. returning nationals, VAT, C86…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                cat === c.id ? 'border-teal-500 bg-teal-600/10 font-medium' : 'hover:bg-muted/60 text-muted-foreground')}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {results.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing matches “{q}”. Try a broader term — e.g. <em>excise</em>, <em>origin</em>, <em>permits</em>.
          </CardContent></Card>
        )}
        {results.map((e) => (
          <Card key={e.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABELS[e.category]}</Badge>
                <Badge variant="outline" className="text-[10px]">{e.jurisdiction}</Badge>
                <h2 className="font-semibold text-base">{e.title}</h2>
              </div>
              <p className="text-xs font-mono text-teal-700 dark:text-teal-400">{e.citation}</p>
              <p className="text-sm">{e.whatItGoverns}</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {e.keyPoints.map((k, i) => (
                  <li key={i} className="flex gap-2"><span className="text-teal-600 shrink-0">•</span><span>{k}</span></li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 items-center pt-1">
                <a href={e.officialSource.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline">
                  <ExternalLink className="h-3 w-3" /> Verify at {e.officialSource.label}
                </a>
                {e.relatedFeature && (
                  <Link href={e.relatedFeature.href} className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-teal-700 dark:hover:text-teal-400">
                    {e.relatedFeature.label} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4 text-sm space-y-1">
          <p className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-amber-600" /> Reference aid — not the law itself</p>
          <p className="text-muted-foreground text-xs">
            This library summarises instruments for daily operational use and cites where each one bites inside CaribClear.
            The authoritative text is the official gazette (laws.gov.tt) and the notices published by Customs and the
            Ministry of Trade. The broker of record remains responsible for every declaration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
