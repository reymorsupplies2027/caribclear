'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CaribbeanMap } from '@/components/caribbean-map';
import {
  Ship, FolderLock, Map, Calculator, ShieldCheck, Users, BellRing,
  Search, FileCheck2, Database, ArrowRight, ArrowDown, ArrowLeftRight,
  Check, Eye, MessageCircle,
} from 'lucide-react';

/* ── Core features — the four cards from the reference ── */
const FEATURES = [
  {
    icon: FolderLock, tint: 'bg-sky-500/10 text-sky-600',
    title: 'Secure Document Vault',
    desc: 'B/L, invoices, packing lists and permits with 5-year retention aligned with Customs Act Cap 78:01 — versioned and expiry-alerted.',
  },
  {
    icon: Map, tint: 'bg-teal-500/10 text-teal-600',
    title: 'Map & Tracking — 7 states',
    desc: 'Sea & air shipments on a visual 7-state timeline from order to release, with containers, ETA and demurrage countdowns.',
  },
  {
    icon: Calculator, tint: 'bg-[#f2764b]/10 text-[#e05f33]',
    title: 'Landed Cost Engine',
    desc: 'CIF, CET duty, Motor Vehicle Tax and 12.5% VAT calculated line by line in TTD using the real 2026 brackets — never hardcoded.',
  },
  {
    icon: ShieldCheck, tint: 'bg-amber-500/10 text-amber-600',
    title: 'Security & Compliance',
    desc: 'Immutable hash-chained audit log, 2FA for admins and database-level tenant isolation (RLS). Hand your auditor a verification, not a promise.',
  },
];

/* ── Also inside the platform ── */
const EXTRAS = [
  { icon: Users, title: 'Importer portal', desc: 'Clients track cargo and approve quotes in one click.' },
  { icon: Search, title: 'HS / CET browser', desc: 'Find codes and duty bands with T&T deviations.' },
  { icon: FileCheck2, title: 'Permits matrix', desc: 'Every T&T import permit with checklist per shipment.' },
  { icon: BellRing, title: 'Smart alerts', desc: 'Docs missing, ETA changes, demurrage 48h/24h out.' },
];

/* ── Platform ecosystem flow ── */
const NODES = {
  data: { icon: Database, tint: 'bg-primary/10 text-primary', title: 'Your Import Data', sub: 'Shipments, documents & lines' },
  whap: { icon: MessageCircle, tint: 'bg-emerald-500/10 text-emerald-600', title: 'WhatsApp Notifications', sub: 'Straight to your client' },
  asycuda: { icon: ShieldCheck, tint: 'bg-sky-500/10 text-sky-600', title: 'ASYCUDA Integration', sub: 'Customs compliance & declarations' },
  ttd: { icon: Calculator, tint: 'bg-[#f2764b]/10 text-[#e05f33]', title: 'TTD Calculations', sub: 'CET · MVT · VAT official formulas' },
};

const STEPS = [
  { n: 1, title: 'Register your company', desc: '60-second wizard creates your tenant with a launch checklist and TT$/USD rate.' },
  { n: 2, title: 'Move your operation in', desc: 'Create shipments, upload documents, calculate landed costs with the official formulas.' },
  { n: 3, title: 'Invite your clients', desc: 'Importers get portal access: their cargo, their costs, their approvals — zero friction.' },
];

function EcoNode({ icon: Icon, tint, title, sub, className }: {
  icon: typeof Database; tint: string; title: string; sub: string; className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center shadow-sm w-full max-w-[220px] mx-auto ${className ?? ''}`}>
      <div className={`h-11 w-11 rounded-xl grid place-items-center ${tint}`}><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-semibold leading-tight">{title}</p>
      <p className="text-xs text-muted-foreground leading-snug">{sub}</p>
    </div>
  );
}

function FlowArrow({ icon: Icon, label, className }: { icon: typeof ArrowRight; label: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center justify-center text-muted-foreground/60 ${className ?? ''}`}>
      <Icon className="h-6 w-6" strokeWidth={1.5} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── NAV — reference pattern ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 h-16 gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="h-9 w-9 rounded-lg bg-primary grid place-items-center shadow-sm">
              <Ship className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="font-bold text-xl tracking-tight">
              <span className="text-teal-600 dark:text-teal-400">Carib</span>Clear
            </span>
          </Link>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#ecosystem" className="hover:text-foreground transition-colors">Ecosystem</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link href="/sales" className="hover:text-foreground transition-colors">Demurrage calculator</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:block text-sm font-medium hover:text-foreground transition-colors">Log In</Link>
            <ThemeToggle />
            <Link href="/register">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm rounded-lg px-4">
                <span className="hidden sm:inline">GET STARTED FREE</span>
                <span className="sm:hidden">Start free</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO — left copy / right product, routes map behind ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-[#e9f1f6] dark:to-[#0e2536]">
          <CaribbeanMap className="pointer-events-none absolute inset-0 h-full w-full text-[#0f2942] opacity-[0.06] dark:text-teal-100 dark:opacity-[0.09]" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-14 pb-20 grid lg:grid-cols-2 gap-12 items-center">
            {/* LEFT — the words */}
            <div className="space-y-6">
              <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
                CARIBBEAN FREIGHT.
                <br />
                <span className="text-teal-600 dark:text-teal-400">CLEARLY.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                The complete TradeTech platform for Trinidad &amp; Tobago. Instant transparency,
                precise TTD cost breakdowns and automated compliance — for customs brokers,
                freight forwarders and the importers they serve.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Link href="/register">
                  <Button size="lg" className="bg-primary hover:bg-[#163a5c] dark:hover:bg-[#3ad2ee] text-primary-foreground px-6 py-6 text-base font-bold rounded-xl shadow-md transition-all w-full sm:w-auto">
                    Create your free account
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="px-6 py-6 text-base font-bold rounded-xl bg-card border-2 w-full sm:w-auto">
                    <Eye className="h-5 w-5 mr-2" /> See live demo data
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">Free plan: 1 user · 3 active shipments · basic vault. No card required.</p>
            </div>

            {/* RIGHT — product visualizations, crystal-clean mock cards */}
            <div className="relative flex flex-col sm:flex-row items-start justify-end gap-4 lg:gap-5">
              {/* Cost breakdown + floating alert column */}
              <div className="flex flex-col items-start gap-0 max-w-md w-full lg:ml-auto relative z-10">
                <div className="bg-card p-6 rounded-2xl shadow-harbor border border-border/60 w-full transform sm:-rotate-1">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cost Breakdown</h4>
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Invoice ready</Badge>
                </div>
                <div className="h-32 bg-muted/60 rounded-lg flex items-end gap-3 p-4 mb-3" aria-hidden="true">
                  <div className="bg-teal-500 w-full h-[40%] rounded-t"></div>
                  <div className="bg-primary w-full h-[75%] rounded-t"></div>
                  <div className="bg-teal-500 w-full h-[60%] rounded-t"></div>
                  <div className="bg-primary w-full h-[95%] rounded-t"></div>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                  <span>Total Landed Cost:</span>
                  <span className="text-primary">TTD $19,040.50</span>
                </div>
                </div>

                {/* Floating WhatsApp notification — tucked under the cost card */}
                <div className="transform rotate-2 sm:-mt-4 sm:ml-4 bg-card p-4 rounded-xl shadow-harbor border border-border/60 max-w-xs flex items-center gap-3 relative z-20">
                  <div className="bg-emerald-500/15 p-2 rounded-full shrink-0">
                    <MessageCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">WhatsApp Alert</p>
                    <p className="text-xs font-semibold text-card-foreground">&ldquo;Shipment released from Port&rdquo;</p>
                  </div>
                </div>
              </div>

              {/* Vault + alert column */}
              <div className="flex flex-col gap-4 w-full sm:w-[220px]">
                <div className="bg-primary text-primary-foreground p-5 rounded-2xl shadow-harbor relative overflow-hidden">
                  <div className="absolute -right-4 -top-6 h-20 w-14 rounded-lg border-2 border-current/20 rotate-12 opacity-30" aria-hidden="true" />
                  <div className="absolute -right-2 -top-4 h-20 w-14 rounded-lg border-2 border-current/20 rotate-6 opacity-50" aria-hidden="true" />
                  <div className="h-10 w-10 rounded-lg bg-white/15 grid place-items-center mb-3">
                    <FolderLock className="h-5 w-5 text-[#ffb597]" />
                  </div>
                  <p className="font-bold">Document Vault</p>
                  <p className="text-xs opacity-80 mt-1 leading-snug">B/L · invoices · packing lists — 5-year retention</p>
                </div>
                <div className="bg-card p-4 rounded-xl shadow-harbor border border-border/60 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/15 grid place-items-center shrink-0">
                    <BellRing className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Demurrage radar</p>
                    <p className="text-xs font-semibold leading-snug">48h left before penalties start</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── CORE FEATURES — four independent cards ── */}
        <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 py-16 scroll-mt-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Core Features</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              The daily work of a broker, done properly: documents that survive an audit, a timeline
              everyone understands, costs with legal math and security by design.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="rounded-2xl shadow-sm border-border/70 hover:shadow-harbor transition-shadow">
                <CardContent className="p-6">
                  <div className={`h-12 w-12 rounded-xl grid place-items-center mb-4 ${f.tint}`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-lg leading-snug">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Also inside */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((x) => (
              <div key={x.title} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-4">
                <x.icon className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{x.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{x.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PLATFORM ECOSYSTEM — one-glance flow diagram ── */}
        <section id="ecosystem" className="border-y bg-muted/30 scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Platform Ecosystem</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Your import data flows through compliance and official TTD formulas, and comes out as
                answers your client can read on WhatsApp. One glance, the whole loop.
              </p>
            </div>

            {/* Mobile: vertical flow (Data → ASYCUDA ↔ TTD → WhatsApp) · md+: 3×3 diagram */}
            <div className="mt-10 grid gap-3 max-w-3xl mx-auto md:grid-cols-[1fr_auto_1fr] md:grid-rows-[auto_auto_auto] md:items-center">
              <EcoNode {...NODES.data} className="order-1 md:col-start-1 md:row-start-1" />
              <FlowArrow icon={ArrowDown} label="feeds compliance" className="order-2 md:col-start-1 md:row-start-2" />
              <EcoNode {...NODES.asycuda} className="order-3 md:col-start-1 md:row-start-3" />
              <FlowArrow icon={ArrowLeftRight} label="formulas checked against declarations" className="order-4 md:col-start-2 md:row-start-3" />
              <EcoNode {...NODES.ttd} className="order-5 md:col-start-3 md:row-start-3" />
              <FlowArrow icon={ArrowDown} label="notifies the client" className="order-6 md:col-start-3 md:row-start-2" />
              <EcoNode {...NODES.whap} className="order-7 md:col-start-3 md:row-start-1" />
              <FlowArrow icon={ArrowRight} label="flows to notifications" className="order-8 hidden md:flex md:col-start-2 md:row-start-1" />
            </div>
            <p className="md:hidden text-center text-xs text-muted-foreground mt-2">Data → compliance → formulas → client alerts</p>
          </div>
        </section>

        {/* ── STEPS ── */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center">Up and running in one afternoon</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="rounded-2xl shadow-sm border-border/70">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-xl bg-teal-500 text-white font-black grid place-items-center mb-4 shadow-sm">{s.n}</div>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── PRICING — left pitch / right cards ── */}
        <section id="pricing" className="border-t bg-gradient-to-br from-background to-[#e9f1f6] dark:to-[#0e2536] scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Freemium that respects<br className="hidden sm:block" /> the little guy.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
                Start free — no credit card, no trial countdown. Upgrade only when the demurrage
                clock and the client portal start paying for themselves. One avoided demurrage week
                pays for three months of Pro.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-teal-600" /> Cancel anytime · your data exports with you (GDPR).
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Free */}
              <Card className="rounded-2xl shadow-sm border-border/70">
                <CardContent className="p-7 flex flex-col h-full">
                  <h3 className="font-bold text-lg">Free</h3>
                  <p className="text-4xl font-black mt-3">TT$0</p>
                  <p className="text-xs text-muted-foreground mt-1">forever</p>
                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    {['1 user', '3 active shipments', 'Basic document vault', 'Landed cost calculator (3/month)', 'HS/CET search'].map((x) => (
                      <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" /> {x}</li>
                    ))}
                  </ul>
                  <Link href="/register"><Button variant="outline" className="w-full mt-7">Start free</Button></Link>
                </CardContent>
              </Card>
              {/* Pro */}
              <Card className="rounded-2xl ring-2 ring-primary shadow-harbor relative">
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0 px-3 uppercase tracking-wide text-[10px]">Most Popular</Badge>
                <CardContent className="p-7 flex flex-col h-full">
                  <h3 className="font-bold text-lg">Pro</h3>
                  <p className="text-4xl font-black mt-3">US$49<span className="text-base font-medium text-muted-foreground">/month</span></p>
                  <p className="text-xs text-muted-foreground mt-1">per company · all modules</p>
                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    {['Unlimited users & shipments', 'Importer client portal', 'Unlimited landed-cost engine', 'Demurrage clock with 48h/24h alarms', 'Full vault + permits + exports'].map((x) => (
                      <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" /> {x}</li>
                    ))}
                  </ul>
                  <Link href="/register">
                    <Button className="w-full mt-7 bg-primary hover:bg-[#163a5c] dark:hover:bg-[#3ad2ee] text-primary-foreground font-bold shadow-md">Go Pro — instant upgrade</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── LEGAL NOTE ── */}
        <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-16">
          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Legal note:</strong> CaribClear is a software tool for managing
              trade operations — it is not a licensed customs agent. Legal responsibility before T&amp;T Customs
              remains with the licensed broker of record. Tax figures shown are configurable reference values
              from versioned legal schedules; confirm the current Legal Notice before filing.
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/70 py-8 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-teal-600" />
            <p>© {new Date().getFullYear()} CaribClear — built for the Caribbean supply chain.</p>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/sales" className="hover:text-foreground">Demurrage calculator</Link>
            <Link href="/login" className="hover:text-foreground">Log In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
