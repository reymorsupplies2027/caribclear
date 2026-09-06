'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Ship, FolderLock, Calculator, ShieldCheck, Users, BellRing, Globe2, Check,
} from 'lucide-react';

const FEATURES = [
  { icon: Ship, title: 'Shipments & tracking', desc: 'Sea & air shipments on a visual 7-state timeline — order → released — with containers, ETA and a demurrage countdown that tells you exactly when penalties start.' },
  { icon: FolderLock, title: 'Document vault (5 years)', desc: 'B/L, invoices, packing lists and permits with versioning and expiry alerts. Retention aligned with Customs Act Cap 78:01.' },
  { icon: Calculator, title: 'Landed cost engine', desc: 'CIF → CET duty → Motor Vehicle Tax → VAT 12.5% → fees, line by line in TTD. Real 2026 brackets, versioned tax table — never hardcoded.' },
  { icon: ShieldCheck, title: 'Compliance by design', desc: 'Immutable hash-chained audit log, 2FA for admins, tenant isolation in the database (RLS) and in the app layer.' },
  { icon: Users, title: 'Importer portal', desc: 'Your clients see their shipments, documents and costs — and approve quotes in one click. One less WhatsApp thread.' },
  { icon: BellRing, title: 'Smart alerts', desc: 'Missing docs, ETA updates, demurrage 3 days out, permits about to expire — in-app now, WhatsApp/email adapters ready.' },
];

const STEPS = [
  { n: 1, title: 'Register your company', desc: '60-second wizard creates your tenant with a launch checklist and TT$/USD rate.' },
  { n: 2, title: 'Move your operation in', desc: 'Create shipments, upload documents, calculate landed costs with the official formulas.' },
  { n: 3, title: 'Invite your clients', desc: 'Importers get portal access: their cargo, their costs, their approvals — zero friction.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-16 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-teal-600 grid place-items-center shrink-0">
              <Globe2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg truncate">CaribClear</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">T&T · CARICOM</Badge>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-teal-600 hidden sm:block">Sign in</Link>
            <Link href="/register"><Button className="bg-teal-600 hover:bg-teal-700">Start free</Button></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 text-center">
          <Badge className="mb-4 bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 border-0">
            TradeTech for Trinidad & Tobago and the Caribbean
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-balance">
            Your entire trade operation,<br className="hidden sm:block" />
            <span className="text-teal-600"> clear as Caribbean water.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Brokers, freight forwarders and importers run on Excel, WhatsApp and email.
            CaribClear puts shipments, documents, landed costs and client approvals in one
            dashboard so friendly it needs no manual.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register"><Button size="lg" className="bg-teal-600 hover:bg-teal-700 px-8">Create your free account</Button></Link>
            <Link href="/api/demo/seed"><Button size="lg" variant="outline" className="px-8">See live demo data</Button></Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Free plan: 1 user · 3 active shipments · basic vault. No card required.</p>
        </section>

        {/* FEATURES */}
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-3xl font-bold text-center">Everything the operation needs. Nothing it doesn&apos;t.</h2>
          <p className="text-center text-muted-foreground mt-2">No filler features — just the daily work of a broker, done well.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-teal-600/10">
                <CardContent className="p-6">
                  <div className="h-11 w-11 rounded-xl bg-teal-600/10 grid place-items-center mb-4">
                    <f.icon className="h-6 w-6 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-teal-600/5 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold text-center">Up and running in one afternoon</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((s) => (
                <Card key={s.n} className="bg-background">
                  <CardContent className="p-6">
                    <div className="h-9 w-9 rounded-full bg-amber-500 text-slate-900 font-bold grid place-items-center mb-4">{s.n}</div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="mx-auto max-w-4xl px-4 py-14">
          <h2 className="text-3xl font-bold text-center">Freemium that respects the little guy</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Card>
              <CardContent className="p-8">
                <h3 className="font-bold text-xl">Free</h3>
                <p className="text-4xl font-extrabold mt-3">TT$0</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {['1 user', '3 active shipments', 'Basic document vault', 'Landed cost calculator (3/month)', 'HS/CET search'].map(x => (
                    <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 mt-0.5" /> {x}</li>
                  ))}
                </ul>
                <Link href="/register"><Button variant="outline" className="w-full mt-8">Start free</Button></Link>
              </CardContent>
            </Card>
            <Card className="border-teal-600 border-2 relative">
              <Badge className="absolute -top-3 right-4 bg-amber-500 text-slate-900 border-0">Most popular</Badge>
              <CardContent className="p-8">
                <h3 className="font-bold text-xl">Pro</h3>
                <p className="text-4xl font-extrabold mt-3">US$49<span className="text-base font-medium text-muted-foreground">/month</span></p>
                <ul className="mt-6 space-y-3 text-sm">
                  {['Unlimited users & shipments', 'Full vault with versioning', 'Unlimited landed-cost engine', 'Importer client portal', 'Quotes & invoices with VAT', 'Smart alerts + exports', 'Priority support'].map(x => (
                    <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 mt-0.5" /> {x}</li>
                  ))}
                </ul>
                <Link href="/register"><Button className="w-full mt-8 bg-teal-600 hover:bg-teal-700">Go Pro — instant upgrade</Button></Link>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* DISCLAIMER */}
        <section className="mx-auto max-w-4xl px-4 pb-14">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 text-sm text-muted-foreground">
              <strong className="text-foreground">Legal note:</strong> CaribClear is a software tool for managing
              trade operations — it is not a licensed customs agent. Legal responsibility before T&amp;T Customs
              remains with the licensed broker of record. Tax figures shown are configurable reference values
              from versioned legal schedules; confirm the current Legal Notice before filing.
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} CaribClear — built for the Caribbean supply chain.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-teal-600">Privacy</Link>
            <Link href="/terms" className="hover:text-teal-600">Terms</Link>
            <Link href="/login" className="hover:text-teal-600">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
