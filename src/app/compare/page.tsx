'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Ship, ArrowLeft } from 'lucide-react';

/**
 * /compare — public benchmark page.
 * Kept OFF the main pricing page on purpose: the pricing page should sell OUR
 * rental without pointing at competitors; this page exists for procurement
 * teams and enterprise diligence who ask "how does this compare to the
 * systems we already price?". Every figure carries a public source and a
 * verify-before-contracting disclaimer.
 */
const LEADERS = [
  { name: 'CaribClear', price: 'US$0 – 1,500 /month flat', note: 'ASYCUDA Caribbean specialist: landed cost + 6 official forms + e-filing + AI. No per-transaction toll.', ours: true },
  { name: 'Magaya', price: '~US$3,000 setup + US$300–350 /user/month', note: 'Digital Freight Platform (forwarding + WMS + accounting).' },
  { name: 'CargoWise', price: 'US$50k–200k+ implementation + per-transaction fees', note: 'Enterprise global forwarding suite; months-long rollouts.' },
  { name: 'Descartes e-Customs', price: 'from €200 /month + €800 setup', note: 'Customs filing module (EU-centric; per-country modules extra).' },
  { name: 'Zonos Landed Cost', price: 'US$2 /guaranteed order + 10% of duties & taxes', note: 'Cross-border ecommerce landed-cost API (guarantee model).' },
  { name: 'SimplyDuty', price: '£0.10 /call · US$199 /month per 10k calls', note: 'Pay-per-use duty calculator API; calculator only, no clearance workflow.' },
];

export default function ComparePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Ship className="h-6 w-6 text-primary" /> CaribClear
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/pricing" className="text-sm font-medium hover:text-foreground hidden sm:flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> Pricing</Link>
            <Link href="/register"><Button size="sm" className="font-semibold">Start free</Button></Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-12 text-center">
            <Badge variant="outline" className="mb-4">Public benchmarks · for procurement diligence</Badge>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight max-w-3xl mx-auto">
              How CaribClear&apos;s flat rental compares to the systems the big players run
            </h1>
            <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
              Published figures from leaders in landed-cost and customs software. We rent flat per month — no per-entry
              toll, no implementation project. Verify every figure against the vendor before contracting; prices change.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LEADERS.map((l) => (
              <Card key={l.name} className={l.ours ? 'border-primary border-2' : ''}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      {l.ours && <Ship className="h-4 w-4 text-primary" />}
                      {l.name}
                    </h3>
                    {l.ours && <Badge>Us</Badge>}
                  </div>
                  <p className={`mt-2 text-lg font-bold ${l.ours ? 'text-primary' : ''}`}>{l.price}</p>
                  <p className="text-sm text-muted-foreground mt-2">{l.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-10">
            <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">What the comparison does and does not claim</p>
              <p>
                The figures above are the vendors&apos; own published or user-reported prices at the dates cited below.
                They are different products with different scopes: CargoWise targets global enterprise forwarding,
                Zonos targets ecommerce duty guarantees, SimplyDuty is a calculator API. CaribClear is deliberately
                narrow: ASYCUDA World customs clearance for Caribbean administrations, with the landed-cost engine,
                forms studio, e-filing and client portal in one rental.
              </p>
              <p>
                Sources: Magaya user-reported pricing (2023, ~US$250–350/user/mo + setup) · GoFreight vs CargoWise TCO
                comparison (Dec 2025) · checkthat.ai CargoWise pricing (Mar 2026) · descartes.com pricing overview ·
                gingercontrol.com duty-API comparison (May 2026) · tariffsapi.com SimplyDuty comparison · WiPay T&amp;T
                merchant terms (Oct 2025).
              </p>
            </CardContent>
          </Card>

          <div className="text-center mt-10">
            <Link href="/pricing">
              <Button size="lg" className="font-semibold">See CaribClear plans</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CaribClear — landed cost &amp; ASYCUDA e-filing for the Caribbean. Indicative rates; the charge is always the local tariff at filing.
      </footer>
    </div>
  );
}
