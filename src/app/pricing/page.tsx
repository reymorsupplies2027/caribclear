'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtUSD } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Check, Minus, Ship, CreditCard, Globe2, Building2 } from 'lucide-react';

interface Plan {
  id: string; label: string; priceUsd: number; blurb: string;
  limits: { users: number; activeShipments: number; calcsPerMonth: number; vaultGb: number; regions: string[] | string };
}
interface PlansData {
  plans: Plan[]; free: Plan;
  paymentRails: { wipay: boolean; paypal: boolean; manual: boolean };
}

export default function PricingPage() {
  const [data, setData] = useState<PlansData | null>(null);

  useEffect(() => {
    api<PlansData>('/api/billing/plans').then(setData).catch(() => null);
  }, []);

  const rails = data?.paymentRails;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* NAV */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Ship className="h-6 w-6 text-primary" /> CaribClear
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/sales" className="text-sm font-medium hover:text-foreground hidden sm:block">Sales portal</Link>
            <Link href="/login"><Button variant="outline" size="sm">Log in</Button></Link>
            <Link href="/register"><Button size="sm" className="font-semibold">Start free</Button></Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-14 text-center">
            <Badge variant="outline" className="mb-4">One platform · 13 ASYCUDA Caribbean administrations</Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto">
              Rent the clearing desk. Flat monthly. <span className="text-primary">Anywhere in the Caribbean.</span>
            </h1>
            <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
              Landed-cost engine calibrated to national law, the six official forms, ASYCUDA World e-filing and AI
              classification — for one flat rental. No per-entry toll, no per-seat surprise.
            </p>
          </div>
        </section>

        {/* TIERS */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {data ? (
              <>
                <TierCard plan={data.free} featured={false} cta="Start free" />
                {data.plans.map((p) => (
                  <TierCard key={p.id} plan={p} featured={p.id === 'regional'} cta={p.id === 'enterprise' ? 'Talk to us' : 'Go live'} />
                ))}
              </>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse"><CardContent className="h-72" /></Card>
              ))
            )}
          </div>

          {/* PAYMENT RAILS */}
          <Card className="mt-10">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4 justify-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2 font-medium text-foreground"><CreditCard className="h-4 w-4" /> Pay your rental with:</span>
                <Badge variant={rails?.wipay ? 'default' : 'outline'}>
                  WiPay {rails?.wipay ? '— live' : '— credentials pending (bank transfer meanwhile)'}
                </Badge>
                <Badge variant={rails?.paypal ? 'default' : 'outline'}>
                  PayPal {rails?.paypal ? '— live' : '— credentials pending (bank transfer meanwhile)'}
                </Badge>
                <span>WiPay settles locally in the Caribbean; PayPal for USD international cards.</span>
              </div>
            </CardContent>
          </Card>
        </section>

        { /* Leader benchmarks moved to /compare — the pricing page sells our rental, not the competition. */ }

        {/* WHO IS IT FOR */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid gap-6 md:grid-cols-3">
            <Card><CardContent className="pt-6">
              <Building2 className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold">Brokers &amp; clearing clerks</h3>
              <p className="text-sm text-muted-foreground mt-2">Pro covers a working desk in Trinidad: unlimited calculations, six official forms, e-filing, vault and the client portal. One flat US$149/month.</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <Globe2 className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold">Multi-island forwarders</h3>
              <p className="text-sm text-muted-foreground mt-2">Regional unlocks all 13 ASYCUDA administrations: regional landed-cost rates (JM/BB/GY/LC/VC/GD/AG), regional e-filing and one vault for every lane.</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <Building2 className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold">Big shippers &amp; manufacturers</h3>
              <p className="text-sm text-muted-foreground mt-2">Enterprise adds country calibration packs (your tariff lines, your negotiated flags), SLA, ERP integration and dedicated onboarding — from US$1,500/month.</p>
            </CardContent></Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CaribClear — landed cost &amp; ASYCUDA e-filing for the Caribbean. Indicative rates; the charge is always the local tariff at filing.
        {' '}
        <Link href="/compare" className="underline hover:text-foreground">Compare with the leaders</Link>
      </footer>
    </div>
  );
}

function TierCard({ plan, featured, cta }: { plan: Plan; featured: boolean; cta: string }) {
  const regions = Array.isArray(plan.limits.regions) && plan.limits.regions[0] === 'ALL'
    ? 'All 13 administrations'
    : 'Trinidad & Tobago';
  return (
    <Card className={featured ? 'border-primary border-2 relative' : 'relative'}>
      {featured && <Badge className="absolute -top-3 left-4">Best for regional rental</Badge>}
      <CardContent className="pt-6 flex flex-col h-full">
        <h3 className="font-bold text-lg">{plan.label}</h3>
        <p className="mt-1"><span className="text-3xl font-extrabold">{plan.priceUsd === 0 ? 'US$0' : fmtUSD(plan.priceUsd)}</span><span className="text-muted-foreground">/month</span></p>
        <p className="text-sm text-muted-foreground mt-2 flex-none">{plan.blurb}</p>
        <ul className="mt-4 space-y-2 text-sm flex-1">
          <Li ok>{plan.limits.users >= 999 ? 'Unlimited seats (review at onboarding)' : `${plan.limits.users} users`}</Li>
          <Li ok>{plan.limits.activeShipments >= 9999 ? 'Unlimited active shipments' : `${plan.limits.activeShipments} active shipments`}</Li>
          <Li ok>{plan.limits.calcsPerMonth >= 9999 ? 'Unlimited saved calculations' : `${plan.limits.calcsPerMonth} saved calculations/month (previews unlimited)`}</Li>
          <Li ok>{regions}</Li>
          <Li ok>{plan.limits.vaultGb} GB encrypted vault</Li>
          <Li ok>AI: OCR invoices, HS classification, demurrage forecast</Li>
          {plan.id !== 'free' && <Li ok>ASYCUDA e-filing + official forms</Li>}
          {plan.id === 'free' && <Li ok={false}>No e-filing / forms studio</Li>}
          {plan.id === 'enterprise' && <Li ok>Country calibration packs + SLA + ERP</Li>}
        </ul>
        <Link href={plan.id === 'enterprise' ? '/sales' : '/register'} className="mt-5">
          <Button className="w-full font-semibold" variant={featured ? 'default' : 'outline'}>{cta}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function Li({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <Check className="h-4 w-4 text-emerald-600 mt-0.5 flex-none" /> : <Minus className="h-4 w-4 text-muted-foreground mt-0.5 flex-none" />}
      <span>{children}</span>
    </li>
  );
}
