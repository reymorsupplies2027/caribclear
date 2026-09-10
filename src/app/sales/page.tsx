'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, fmtTTD } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { CaribbeanMap } from '@/components/caribbean-map';
import { useToast } from '@/hooks/use-toast';
import {
  Ship, Timer, ShieldCheck, FileCheck2, BellRing, WifiOff, Check, X,
  Calculator, TrendingDown, Lock, Quote as QuoteIcon, ArrowRight, MapPin, Sparkles,
} from 'lucide-react';

const REGIONS = ['Trinidad', 'Tobago', 'Jamaica', 'Barbados', 'Guyana', 'CARICOM'];

export default function SalesPortal() {
  const { toast } = useToast();
  // Live demurrage calculator (the lead magnet)
  const [containers, setContainers] = useState(1);
  const [daysAtPort, setDaysAtPort] = useState(8);
  const [freeDays, setFreeDays] = useState(5);
  const [perDay, setPerDay] = useState(350);

  // Lead form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [region, setRegion] = useState('Trinidad');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const penaltyDays = Math.max(0, daysAtPort - freeDays);
  const exposure = penaltyDays * perDay * containers;
  const perDayNow = perDay * containers;

  async function saveLead(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await api('/api/sales/lead', {
        method: 'POST',
        body: JSON.stringify({ name, email, company, region, exposureTtd: exposure, message }),
      });
      setSent(true);
      toast({ title: 'Saved — check your inbox', description: 'We will reach out with your Founding Broker invitation.' });
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-lg bg-primary grid place-items-center shadow-sm"><Ship className="h-5 w-5 text-primary-foreground" /></span>
            <span className="font-bold text-xl tracking-tight"><span className="text-teal-600">Carib</span>Clear</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm font-medium hover:text-foreground hidden sm:block">Pricing</Link>
            <Link href="/login" className="text-sm font-medium hover:text-foreground hidden sm:block">Log In</Link>
            <ThemeToggle />
            <Link href="/register"><Button className="bg-primary hover:bg-[#163a5c] dark:hover:bg-[#3ad2ee] text-primary-foreground font-semibold">Start free</Button></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO: loss aversion + live calculator ── */}
        <section className="relative overflow-hidden">
          <CaribbeanMap className="pointer-events-none absolute inset-0 h-full w-full text-[#0f2942] opacity-[0.05] dark:text-teal-100 dark:opacity-[0.08]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-16 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <Badge className="bg-rose-500/10 text-rose-600 border-0 mb-4">Every day your container sleeps, you pay</Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Your containers are bleeding money at the port.<br />
              <span className="text-teal-600">Exactly how much?</span>
            </h1>
            <p className="text-muted-foreground mt-4 text-base sm:text-lg">
              CaribClear is the operations desk for Caribbean customs brokers and importers: a live demurrage clock on every container,
              a landed-cost engine with the real 2026 T&amp;T rates, a 5-year document vault and a client portal with one-click approvals.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <a href="#calculator"><Button size="lg" className="bg-rose-600 hover:bg-rose-700 px-6"><Calculator className="h-4 w-4 mr-2" />Calculate my exposure — free</Button></a>
              <Link href="/register"><Button size="lg" variant="outline" className="px-6">Start free now</Button></Link>
            </div>
            <p className="text-xs text-muted-foreground mt-4">No card. 60 seconds. Your first container on the clock today.</p>
          </div>

          {/* LIVE CALCULATOR */}
          <Card id="calculator" className="border-rose-500/30 shadow-lg shadow-rose-500/5 scroll-mt-20">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-lg bg-rose-600/10 grid place-items-center"><Timer className="h-5 w-5 text-rose-600" /></div>
                <div>
                  <p className="font-bold">Demurrage exposure calculator</p>
                  <p className="text-xs text-muted-foreground">Move the sliders to your real situation — the number is what the port is about to charge you.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1"><Label htmlFor="sc-containers">Containers at port</Label><span className="font-bold">{containers}</span></div>
                  <input id="sc-containers" type="range" min={1} max={20} value={containers} onChange={e => setContainers(Number(e.target.value))} className="w-full accent-rose-600" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><Label htmlFor="sc-days">Days at port so far</Label><span className="font-bold">{daysAtPort}</span></div>
                  <input id="sc-days" type="range" min={1} max={30} value={daysAtPort} onChange={e => setDaysAtPort(Number(e.target.value))} className="w-full accent-rose-600" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1"><Label htmlFor="sc-free">Free days</Label><span className="font-bold">{freeDays}</span></div>
                    <input id="sc-free" type="range" min={1} max={14} value={freeDays} onChange={e => setFreeDays(Number(e.target.value))} className="w-full accent-teal-600" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1"><Label htmlFor="sc-rate">Penalty TT$/day</Label><span className="font-bold">{perDay}</span></div>
                    <input id="sc-rate" type="range" min={100} max={900} step={25} value={perDay} onChange={e => setPerDay(Number(e.target.value))} className="w-full accent-teal-600" />
                  </div>
                </div>

                <div className={`rounded-xl border p-4 text-center ${penaltyDays > 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
                  {penaltyDays > 0 ? (
                    <>
                      <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Accrued demurrage exposure</p>
                      <p className="text-4xl font-extrabold text-rose-600 mt-1">{fmtTTD(exposure)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{penaltyDays} penalty day(s) × TT${perDay}/day × {containers} container(s) — and it grows <span className="font-bold text-rose-600">{fmtTTD(perDayNow)} every day</span> you wait.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Still inside the grace window</p>
                      <p className="text-2xl font-extrabold text-emerald-600 mt-1">{freeDays - daysAtPort} free day(s) left</p>
                      <p className="text-xs text-muted-foreground mt-1">Clear before the window closes or it becomes {fmtTTD(perDayNow)}/day — brokers who miss this window rarely notice until the invoice arrives.</p>
                    </>
                  )}
                </div>
                <a href="#save" className="block">
                  <Button className="w-full bg-teal-600 hover:bg-teal-700">Save this number &amp; stop the clock <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </a>
              </div>
            </CardContent>
          </Card>
          </div>
        </section>

        {/* ── CONTRAST ── */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-14 grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-muted bg-background/60 p-6 grayscale-[0.4]">
              <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Your desk today</p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  'Demurrage deadlines live in someone\u2019s head (or a WhatsApp group)',
                  'Landed costs in an Excel with last year\u2019s rates',
                  'Clients calling every hour: \u201cd\u00f3nde est\u00e1 mi carga?\u201d',
                  'Documents scattered: email, USB, photos of stamps',
                  'An auditor asks for a 3-year-old file. Silence.',
                ].map(x => (
                  <li key={x} className="flex items-start gap-2.5"><X className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" /><span className="text-muted-foreground">{x}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-teal-600/40 bg-teal-600/5 p-6">
              <p className="text-sm font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">Your desk with CaribClear</p>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  'A live countdown per container, with 48h and 24h alarms before penalties start',
                  'Landed cost in seconds with the versioned 2026 CET/MVT/VAT table — with legal effective dates',
                  'Clients see everything in their own portal and approve with one click',
                  'Every document versioned, expiry-alerted, retained 5 years',
                  'An immutable hash-chained audit trail you can hand to any auditor',
                ].map(x => (
                  <li key={x} className="flex items-start gap-2.5"><Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" /><span>{x}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── AUTHORITY ── */}
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight text-center">Built on the law, not on folklore</h2>
          <p className="text-center text-muted-foreground mt-2 max-w-2xl mx-auto">Every number in CaribClear traces back to a legal source — and when the law changes, you get the new table with its effective date and the exact diff.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-8">
            {[
              { icon: FileCheck2, t: 'Customs Act Cap 78:01', d: '5-year record retention enforced by the vault, not by memory.' },
              { icon: FileCheck2, t: 'CARICOM CET', d: 'Duty bands by HS code with T&T national deviations, versioned with vigencia.' },
              { icon: FileCheck2, t: 'VAT Act — 12.5%', d: 'VAT applied over CIF + duty + MVT exactly as Schedule 2 states.' },
              { icon: FileCheck2, t: 'MVT & foreign-used 75%', d: 'Motor vehicle tax per cc with the foreign-used 75% factor, by engine size.' },
            ].map(x => (
              <Card key={x.t}><CardContent className="p-5">
                <x.icon className="h-5 w-5 text-teal-600 mb-2" />
                <p className="font-bold text-sm">{x.t}</p>
                <p className="text-xs text-muted-foreground mt-1">{x.d}</p>
              </CardContent></Card>
            ))}
          </div>
        </section>

        {/* ── THE MONEY CLOCK + PWA + SECURITY ── */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-14 grid gap-6 md:grid-cols-3">
            {[
              { icon: BellRing, t: 'The money clock', d: 'A live demurrage countdown per container with exposure projected in TT$ per day, red/amber/green, and automatic alarms at 48h and 24h — in the app and as push notifications on your phone.' },
              { icon: WifiOff, t: 'Works without signal', d: 'Install it on your phone. No signal at the port or in the customs yard? Keep working — approvals queue on the device and sync the moment you reconnect. The dashboard opens from the last saved copy.' },
              { icon: Lock, t: 'Bank-grade by design', d: 'Your data is isolated in the database itself (row-level security), admins use 2FA, and every action lands in a hash-chained immutable audit log. Hand your auditor a verification, not a promise.' },
            ].map(x => (
              <Card key={x.t}><CardContent className="p-6">
                <div className="h-10 w-10 rounded-xl bg-teal-600/10 grid place-items-center mb-3"><x.icon className="h-5 w-5 text-teal-600" /></div>
                <p className="font-bold">{x.t}</p>
                <p className="text-sm text-muted-foreground mt-1.5">{x.d}</p>
              </CardContent></Card>
            ))}
          </div>
        </section>

        {/* ── PRICING (anchored) ── */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl font-extrabold tracking-tight text-center">Pricing that makes the alarm worth it</h2>
          <p className="text-center text-muted-foreground mt-2">One wrong HS classification can cost more than a year of Pro. One avoided demurrage week pays for the month.</p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 mt-8 items-stretch">
            <Card>
              <CardContent className="p-6 flex flex-col h-full">
                <p className="font-bold">Free</p>
                <p className="text-3xl font-extrabold mt-2">US$0</p>
                <p className="text-xs text-muted-foreground">forever</p>
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />1 user</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />3 active shipments</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />Basic vault + landed cost calculator</li>
                </ul>
                <Link href="/register"><Button variant="outline" className="w-full mt-5">Start free</Button></Link>
              </CardContent>
            </Card>
            <Card className="ring-2 ring-primary shadow-harbor relative rounded-2xl">
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0 uppercase tracking-wide text-[10px] px-3">Most Popular</Badge>
              <CardContent className="p-6 flex flex-col h-full">
                <p className="font-bold">Pro</p>
                <p className="text-3xl font-extrabold mt-2">US$149<span className="text-sm font-medium text-muted-foreground">/month</span></p>
                <p className="text-xs text-muted-foreground">per company · Trinidad &amp; Tobago</p>
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  {['10 users, unlimited clients', 'Unlimited shipments + demurrage clock with 48/24h alarms', 'Engine v2 + 6 official forms + e-filing', 'AI: OCR, HS classification, demurrage forecast', 'Importer portal + offline PWA + push'].map(x => (
                    <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />{x}</li>
                  ))}
                </ul>
                <Link href="/register"><Button className="w-full mt-5 bg-primary hover:bg-[#163a5c] dark:hover:bg-[#3ad2ee] text-primary-foreground font-bold">Go Pro</Button></Link>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex flex-col h-full">
                <p className="font-bold">Regional</p>
                <p className="text-3xl font-extrabold mt-2">US$449<span className="text-sm font-medium text-muted-foreground">/month</span></p>
                <p className="text-xs text-muted-foreground">everything in Pro · all Caribbean</p>
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  {['All 13 ASYCUDA administrations', 'Regional rates: JM, BB, GY, LC, VC, GD, AG', 'Regional e-filing + one vault per lane', '15 users · 100 GB vault'].map(x => (
                    <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />{x}</li>
                  ))}
                </ul>
                <Link href="/register"><Button variant="outline" className="w-full mt-5 font-semibold">Go Regional</Button></Link>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex flex-col h-full">
                <p className="font-bold">Enterprise</p>
                <p className="text-3xl font-extrabold mt-2">US$1,500<span className="text-sm font-medium text-muted-foreground">/month+</span></p>
                <p className="text-xs text-muted-foreground">multi-office groups &amp; big shippers</p>
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  {['Everything in Regional', 'Country calibration packs', 'SLA + ERP integration', 'Priority support + onboarding on site'].map(x => (
                    <li key={x} className="flex gap-2"><Check className="h-4 w-4 text-teal-600 shrink-0" />{x}</li>
                  ))}
                </ul>
                <a href="#save"><Button variant="outline" className="w-full mt-5">Talk to us</Button></a>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6">
            Pay your rental with WiPay or PayPal — see <Link href="/pricing" className="font-semibold text-primary hover:underline">full pricing &amp; comparison</Link>.
          </p>
        </section>

        {/* ── FOUNDING PROGRAM + LEAD FORM ── */}
        <section id="save" className="border-t bg-slate-950 text-slate-100 scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <Badge className="bg-amber-500 text-slate-900 border-0 mb-3"><Sparkles className="h-3 w-3 mr-1" />Founding Broker Program — 10 spots</Badge>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Be one of the ten brokers who never pay a demurrage surprise again</h2>
              <p className="text-slate-400 mt-3 text-sm sm:text-base">
                The first ten companies from Trinidad &amp; the Caribbean get their price locked for life, onboarding with the founder,
                and a direct line to shape the product. When the ten spots are gone, the program closes — no extensions, no exceptions.
              </p>
              <div className="mt-5 space-y-2 text-sm">
                {['Price locked for life (even as the platform grows)', 'White-glove onboarding: your first week of containers migrated with you', 'Your name on the founding wall of the building'].map(x => (
                  <p key={x} className="flex items-start gap-2"><Check className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />{x}</p>
                ))}
              </div>
            </div>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-6">
                {sent ? (
                  <div className="text-center py-8">
                    <div className="h-12 w-12 rounded-full bg-emerald-500/15 grid place-items-center mx-auto mb-3"><Check className="h-6 w-6 text-emerald-400" /></div>
                    <p className="font-bold">You&apos;re on the list.</p>
                    <p className="text-sm text-slate-400 mt-1">We&apos;ll contact you within one business day with your Founding Broker invitation and your exposure number attached.</p>
                  </div>
                ) : (
                  <form onSubmit={saveLead} className="space-y-3">
                    <p className="font-bold">Save my number — count me in</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label htmlFor="ld-name" className="text-slate-300">Name *</Label>
                        <Input id="ld-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Alicia Ramkissoon" className="bg-slate-950 border-slate-700" /></div>
                      <div className="space-y-1"><Label htmlFor="ld-company" className="text-slate-300">Company</Label>
                        <Input id="ld-company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Broker Ltd" className="bg-slate-950 border-slate-700" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label htmlFor="ld-email" className="text-slate-300">Email *</Label>
                        <Input id="ld-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@broker.com" className="bg-slate-950 border-slate-700" /></div>
                      <div className="space-y-1"><Label htmlFor="ld-region" className="text-slate-300"><MapPin className="inline h-3 w-3" /> Region</Label>
                        <select id="ld-region" value={region} onChange={e => setRegion(e.target.value)} className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm">
                          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select></div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ld-msg" className="text-slate-300">Your biggest bottleneck (optional)</Label>
                      <Textarea id="ld-msg" rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Containers stuck at POS every month…" className="bg-slate-950 border-slate-700" />
                    </div>
                    <p className="text-xs text-slate-500">Your calculated exposure of <span className="font-bold text-rose-400">{fmtTTD(exposure)}</span> will be attached so we prepare your case.</p>
                    <Button type="submit" disabled={sending} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold">
                      <TrendingDown className="h-4 w-4 mr-1" />{sending ? 'Saving…' : 'Claim my founding spot'}
                    </Button>
                    <p className="text-[11px] text-slate-500">We only use your email to contact you about CaribClear. No spam, no resale.</p>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} CaribClear — operations software for foreign trade. A tool for brokers and importers; it does not replace legal or customs advice.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-teal-600">Privacy</Link>
            <Link href="/terms" className="hover:text-teal-600">Terms</Link>
            <Link href="/" className="hover:text-teal-600">Product</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
