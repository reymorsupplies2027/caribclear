'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CaribbeanMap } from '@/components/caribbean-map';
import {
  Ship, Radar, Calculator, LockKeyhole, History, ShieldCheck, Users, BellRing,
  Search, FileCheck2, Database, ArrowRight, ArrowDown, ArrowLeftRight,
  Check, Play, MessageCircle, FileText, MoreVertical,
} from 'lucide-react';

/* ── Core features — the four pillars of the institutional reference ── */
const FEATURES = [
  {
    icon: History, title: 'Immutable Audit Trail',
    desc: 'Every action lands on a hash-chained, tamper-evident audit log — hand your auditor a verification, not a promise.',
  },
  {
    icon: Radar, title: 'Real-time ASYCUDA Status',
    desc: 'Live declaration status tracking linked straight into your customs entries, from lodgement to release.',
  },
  {
    icon: Calculator, title: 'Landed Cost Engine',
    desc: 'CIF, CET duty, Motor Vehicle Tax and 12.5% VAT line by line in TTD, using the real 2026 brackets — never hardcoded.',
  },
  {
    icon: LockKeyhole, title: 'Tenant Isolation',
    desc: 'Database-level isolation (RLS), tenant-scoped vaults and 2FA for admins — maximum file vault safety.',
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

/* ── Mockup timeline rows (real ASYCUDA stages) ── */
const TIMELINE = [
  { state: 'done', label: 'Arrival', note: 'Last update: Sep 2, 2026' },
  { state: 'done', label: 'Lodgement', note: 'Last update: Sep 3, 2026' },
  { state: 'query', label: 'Query', note: 'Last update: Sep 5, 2026' },
  { state: 'pending', label: 'Release', note: 'Awaiting Customs' },
];

const COST_ROWS = [
  { k: 'CIF Value', v: 'TTD $12,000' },
  { k: 'CET Duty (67.5%)', v: 'TTD $8,100' },
  { k: 'Motor Vehicle Tax', v: 'TTD $1,200' },
  { k: 'VAT (12.5%)', v: 'TTD $2,663' },
  { k: 'Customs & env. fees', v: 'TTD $130' },
];

function EcoNode({ icon: Icon, tint, title, sub, className }: {
  icon: typeof Database; tint: string; title: string; sub: string; className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center shadow-sm w-full max-w-[220px] mx-auto ${className ?? ''}`}>
      <div className={`h-11 w-11 rounded-xl grid place-items-center ${tint}`}><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-bold leading-tight text-[#0f172a] dark:text-slate-100">{title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{sub}</p>
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
      {/* ── NAV — institutional reference ── */}
      <header className="sticky top-0 z-40 border-b border-slate-100 dark:border-white/10 bg-white/80 dark:bg-[#0b192c]/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-8 h-16 gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="h-9 w-9 rounded-lg bg-primary grid place-items-center shadow-sm">
              <Ship className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="font-black text-xl tracking-tight text-[#0F172A] dark:text-slate-100">
              <span className="text-teal-600 dark:text-teal-400">Carib</span>Clear
            </span>
          </Link>
          <nav className="hidden md:flex gap-6 xl:gap-8 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Features</a>
            <a href="#ecosystem" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Ecosystem</a>
            <a href="#compliance" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Compliance (Cap 78:01)</a>
            <a href="#pricing" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Pricing</a>
            <Link href="/sales" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Demurrage calculator</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="hidden sm:block text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-[#0F172A] dark:hover:text-white transition-colors">Log In</Link>
            <ThemeToggle />
            <Link href="/register">
              <Button className="bg-[#0F172A] hover:bg-[#1E293B] dark:bg-teal-400 dark:hover:bg-[#3ad2ee] dark:text-[#041824] text-white font-bold shadow-sm rounded-lg px-4 tracking-wide">
                <span className="hidden sm:inline">GET STARTED FREE</span>
                <span className="sm:hidden">Start free</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO — left copy (5) / right high-density mockup (7), route map bottom-left ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-white dark:to-[#0e2536]">
          {/* Route map — bottom-left corner decoration (reference pattern) */}
          <div aria-hidden="true" className="absolute bottom-0 left-0 w-full max-w-md pointer-events-none opacity-20 dark:opacity-10 hidden lg:block text-slate-400 dark:text-teal-100">
            <CaribbeanMap className="w-full h-auto" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8 pt-16 pb-24 grid lg:grid-cols-12 gap-12 items-center">
            {/* LEFT — the words */}
            <div className="lg:col-span-5 space-y-6">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-[#0F172A] dark:text-slate-100">
                TRANSPARENT T&amp;T
                <br />
                <span className="text-teal-600 dark:text-teal-400">CUSTOMS CLEARANCE.</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300 font-medium leading-relaxed max-w-md">
                Your secure TradeTech platform for instant TTD landed-cost breakdowns, automated
                7-state timeline tracking, and Customs Act Cap 78:01 compliance.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/register">
                  <Button size="lg" className="bg-[#0F172A] hover:bg-[#1E293B] dark:bg-teal-400 dark:hover:bg-[#3ad2ee] dark:text-[#041824] text-white px-7 py-6 text-base font-bold rounded-lg shadow-md hover:-translate-y-0.5 transition-all w-full sm:w-auto">
                    Start for TT$0
                  </Button>
                </Link>
                <Link href="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="group w-full sm:w-auto px-7 py-6 text-base font-bold rounded-lg bg-teal-400/15 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 border border-teal-400/30 hover:bg-teal-400/25 dark:hover:bg-teal-400/20 hover:border-teal-400/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-500/15 transition-all duration-200"
                  >
                    Watch 60s Demo
                    <Play className="h-4 w-4 ml-2 fill-current transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-400 tracking-wide">Free plan: 1 user · 3 active shipments · basic vault. No card required.</p>
            </div>

            {/* RIGHT — simulated dashboard, high-density */}
            <div className="lg:col-span-7 relative">
              {/* Soft turquoise halo behind the mockup */}
              <div aria-hidden="true" className="absolute inset-0 bg-[#00A9C6]/5 rounded-3xl blur-3xl transform -rotate-1 pointer-events-none" />
              <div aria-hidden="true" className="absolute -top-8 -right-8 w-64 h-64 bg-[#00A9C4] rounded-full blur-[110px] opacity-20 dark:opacity-25 pointer-events-none" />

              <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 p-6 relative z-10 grid grid-cols-12 gap-4">
                {/* Shipment timeline — left pane */}
                <div className="col-span-12 lg:col-span-7 lg:border-r border-slate-100 dark:border-white/10 lg:pr-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Shipment Timeline</h3>
                    <span className="text-[10px] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-bold">Clear Status</span>
                  </div>
                  <div className="space-y-3 relative">
                    <div aria-hidden="true" className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-slate-100 dark:bg-white/10" />
                    {TIMELINE.map((t) => (
                      <div key={t.label} className={`flex gap-3 items-start relative z-10 ${t.state === 'pending' ? 'opacity-40' : ''}`}>
                        {t.state === 'done' && (
                          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white grid place-items-center text-[9px] font-bold shrink-0">✓</span>
                        )}
                        {t.state === 'query' && (
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-white grid place-items-center text-[9px] font-bold shrink-0">!</span>
                        )}
                        {t.state === 'pending' && <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-600 shrink-0" />}
                        <div>
                          <p className={`text-xs font-bold text-slate-800 dark:text-slate-100 ${t.state === 'query' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{t.label}</p>
                          <p className="text-[10px] text-slate-400">{t.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost breakdown + vault — right pane */}
                <div className="col-span-12 lg:col-span-5 flex flex-col justify-between lg:pl-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-xs font-medium">
                      {COST_ROWS.map((r) => (
                        <div key={r.k} className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>{r.k}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200">{r.v}</span>
                        </div>
                      ))}
                      <div className="border-t border-slate-100 dark:border-white/10 pt-2 flex justify-between font-black text-sm text-[#0F172A] dark:text-slate-100">
                        <span>Total</span>
                        <span className="text-teal-700 dark:text-teal-300">TT$24,093</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/10">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-2">Document Vault</h4>
                    <div className="space-y-1">
                      {['B_L_Master_QT2214.pdf', 'Invoice_Customs.pdf'].map((f) => (
                        <div key={f} className="bg-slate-50 dark:bg-white/5 p-1.5 rounded text-[10px] font-bold flex justify-between items-center text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-1.5"><FileText className="h-3 w-3 text-teal-600 dark:text-teal-400" />{f}</span>
                          <MoreVertical className="h-3 w-3 text-slate-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating WhatsApp notification */}
              <div className="absolute -bottom-5 left-6 transform -rotate-2 bg-white dark:bg-card p-3.5 rounded-xl shadow-harbor border border-slate-100 dark:border-white/10 max-w-[240px] flex items-center gap-3 relative z-20">
                <div className="bg-emerald-500/15 p-2 rounded-full shrink-0">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">WhatsApp Alert</p>
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">&ldquo;Shipment released from Port&rdquo;</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CORE FEATURES — centered header, 4 institutional cards ── */}
        <section id="features" className="bg-white dark:bg-transparent border-t border-slate-100 dark:border-white/10 relative z-20 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
            <div className="text-center max-w-xl mx-auto mb-12">
              <h2 className="text-xs font-bold tracking-widest text-teal-600 dark:text-teal-400 uppercase mb-2">Features</h2>
              <p className="text-3xl font-black tracking-tight text-[#0F172A] dark:text-slate-100">The daily work of a broker, done properly.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-slate-50 dark:bg-card p-6 rounded-2xl border border-slate-100 dark:border-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center shadow-sm">
                    <f.icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="text-base font-extrabold text-[#0F172A] dark:text-slate-100">{f.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* Also inside */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXTRAS.map((x) => (
                <div key={x.title} className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-white/10 bg-background p-4">
                  <x.icon className="h-5 w-5 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#0f172a] dark:text-slate-100">{x.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{x.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PLATFORM ECOSYSTEM — one-glance flow diagram ── */}
        <section id="ecosystem" className="border-y bg-muted/30 scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-8 py-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F172A] dark:text-slate-100">Platform Ecosystem</h2>
              <p className="mt-3 text-slate-500 dark:text-slate-400 leading-relaxed">
                Your import data flows through compliance and official TTD formulas, and comes out as
                answers your client can read on WhatsApp. One glance, the whole loop.
              </p>
            </div>

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
            <p className="md:hidden text-center text-xs text-slate-500 dark:text-slate-400 mt-2">Data → compliance → formulas → client alerts</p>
          </div>
        </section>

        {/* ── STEPS ── */}
        <section className="mx-auto max-w-7xl px-4 sm:px-8 py-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-[#0F172A] dark:text-slate-100">Up and running in one afternoon</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="rounded-2xl shadow-sm border-slate-100 dark:border-white/10">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-xl bg-teal-500 text-white font-black grid place-items-center mb-4 shadow-sm">{s.n}</div>
                  <h3 className="font-extrabold text-[#0f172a] dark:text-slate-100">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── PRICING — left pitch / right cards ── */}
        <section id="pricing" className="border-t bg-gradient-to-br from-background to-white dark:to-[#0e2536] scroll-mt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-8 py-16 grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-[#0F172A] dark:text-slate-100">
                Freemium that respects<br className="hidden sm:block" /> the little guy.
              </h2>
              <p className="mt-4 text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                Start free — no credit card, no trial countdown. Upgrade only when the demurrage
                clock and the client portal start paying for themselves. One avoided demurrage week
                pays for three months of Pro.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Cancel anytime · your data exports with you (GDPR).
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Free */}
              <Card className="rounded-2xl shadow-sm border-slate-100 dark:border-white/10">
                <CardContent className="p-7 flex flex-col h-full">
                  <h3 className="font-bold text-lg">Free</h3>
                  <p className="text-4xl font-black mt-3">TT$0</p>
                  <p className="text-xs text-slate-400 mt-1">forever</p>
                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    {['1 user', '3 active shipments', 'Basic document vault', 'Landed cost calculator (3/month)', 'HS/CET search'].map((x) => (
                      <li key={x} className="flex gap-2 text-slate-600 dark:text-slate-300"><Check className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" /> {x}</li>
                    ))}
                  </ul>
                  <Link href="/register">
                    <Button
                      variant="outline"
                      className="w-full mt-7 bg-transparent border-slate-200 dark:border-white/15 text-slate-500 dark:text-slate-400 font-semibold hover:bg-muted/60 hover:text-foreground hover:border-border transition-all"
                    >
                      Start free
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              {/* Pro */}
              <Card className="rounded-2xl ring-2 ring-[#0F172A] dark:ring-teal-400 shadow-harbor relative">
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0F172A] dark:bg-teal-400 dark:text-[#041824] text-white border-0 px-3 uppercase tracking-wide text-[10px]">Most Popular</Badge>
                <CardContent className="p-7 flex flex-col h-full">
                  <h3 className="font-bold text-lg">Pro</h3>
                  <p className="text-4xl font-black mt-3">US$49<span className="text-base font-medium text-slate-400">/month</span></p>
                  <p className="text-xs text-slate-400 mt-1">per company · all modules</p>
                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    {['Unlimited users & shipments', 'Importer client portal', 'Unlimited landed-cost engine', 'Demurrage clock with 48h/24h alarms', 'Full vault + permits + exports'].map((x) => (
                      <li key={x} className="flex gap-2 text-slate-600 dark:text-slate-300"><Check className="h-4 w-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" /> {x}</li>
                    ))}
                  </ul>
                  <Link href="/register">
                    <Button className="w-full mt-7 bg-[#0F172A] hover:bg-[#1E293B] dark:bg-teal-400 dark:hover:bg-[#3ad2ee] dark:text-[#041824] text-white font-bold shadow-lg shadow-teal-500/25 dark:shadow-teal-400/15 hover:shadow-teal-500/40 dark:hover:shadow-teal-300/25 hover:-translate-y-0.5 transition-all">
                      Go Pro — instant upgrade
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── LEGAL / COMPLIANCE NOTE ── */}
        <section id="compliance" className="mx-auto max-w-4xl px-4 sm:px-8 pb-16 scroll-mt-16">
          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong className="text-[#0F172A] dark:text-slate-100">Legal note (Customs Act Cap 78:01):</strong> CaribClear is a software tool for managing
              trade operations — it is not a licensed customs agent. Legal responsibility before T&amp;T Customs
              remains with the licensed broker of record. Tax figures shown are configurable reference values
              from versioned legal schedules; confirm the current Legal Notice before filing.
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-100 dark:border-white/10 py-8 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-teal-600 dark:text-teal-400" />
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
