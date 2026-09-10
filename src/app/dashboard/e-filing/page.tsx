'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  FileCheck2, Loader2, ShieldCheck, AlertTriangle, Download, Send, Landmark,
  Stamp, Ban, RotateCcw, ChevronDown, ChevronUp, Globe2, ExternalLink,
} from 'lucide-react';
import type { AsycudaDeclaration, FormIssue } from '@/lib/engine/asycuda';
import type { CustomsRegion } from '@/lib/engine/customs-regions';

/**
 * e-Filing (ASYCUDA World) — validates the declaration built from real
 * shipment + landed-cost data, generates the SAD XML for upload on the
 * administration's portal, and tracks the real customs response (registration
 * number, assessment, payment) step by step. Nothing is auto-submitted: the
 * registered declarant lodges on the administration's portal, CaribClear
 * prepares the data and keeps the evidence chain.
 */

interface ShipmentLite { id: string; reference: string; goodsDescription: string; clientName: string | null }
interface FilingRow {
  id: string; shipmentId: string | null; country: string; declarationType: string; office: string;
  status: string; statusLabel: string; currencyCode: string; exchangeRate: number;
  registrationNumber: string | null; registrationDate: string | null;
  assessmentNumber: string | null; assessedTotal: number | null;
  receiptNumber: string | null; paidAt: string | null; xmlChecksum: string | null;
  timelineJson: string; updatedAt: string;
  shipment?: { reference: string; goodsDescription: string } | null;
}
interface DeclarationTypes { code: string; label: string }
interface Statuses { id: string; label: string }
type TimelineEntry = { status: string; at: string; byName: string; note?: string };

const CALIBRATION_LABEL: Record<string, { label: string; cls: string }> = {
  full: { label: 'Engine calibrated', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'e-Filing ready', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  struct: { label: 'Structure ready', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    validated: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    xml_generated: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    filed: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
    registered: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    assessed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    cleared: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    rejected: 'bg-red-500/15 text-red-600 dark:text-red-400',
    queried: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  };
  return <Badge className={cls[status] || 'bg-muted text-muted-foreground'}>{label}</Badge>;
}

function IssueList({ title, issues, tone }: { title: string; issues: FormIssue[]; tone: 'error' | 'warn' }) {
  if (!issues.length) return null;
  return (
    <div className={`rounded-lg border p-3 text-sm ${tone === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <p className={`font-medium flex items-center gap-2 ${tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {tone === 'error' ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {title} ({issues.length})
      </p>
      <ul className="mt-2 space-y-1 list-disc list-inside text-muted-foreground">
        {issues.map((i, k) => <li key={k}><span className="font-mono text-xs">{i.field}</span> — {i.message}</li>)}
      </ul>
    </div>
  );
}

export default function EFilingPage() {
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [regions, setRegions] = useState<CustomsRegion[]>([]);
  const [declTypes, setDeclTypes] = useState<DeclarationTypes[]>([]);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [shipmentId, setShipmentId] = useState('');
  const [country, setCountry] = useState('TT');
  const [office, setOffice] = useState('');
  const [officeOfEntry, setOfficeOfEntry] = useState('');
  const [declarationType, setDeclarationType] = useState('IM4');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('');
  const [locationOfGoods, setLocationOfGoods] = useState('');

  const [validation, setValidation] = useState<{ declaration: AsycudaDeclaration; errors: FormIssue[]; warnings: FormIssue[] } | null>(null);
  const [busy, setBusy] = useState<'validate' | 'generate' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [sh, reg, fl] = await Promise.all([
        api<{ shipments: Array<ShipmentLite & { client: { name: string; company: string } | null }> }>('/api/shipments'),
        api<{ regions: CustomsRegion[]; declarationTypes: DeclarationTypes[] }>('/api/asycuda/regions'),
        api<{ filings: FilingRow[] }>('/api/asycuda/filings'),
      ]);
      setShipments(sh.shipments.map((s) => ({ ...s, clientName: s.client?.company || s.client?.name || null })));
      setRegions(reg.regions); setDeclTypes(reg.declarationTypes);
      setFilings(fl.filings);
    } catch { /* offline: PWA fallback handles the notice */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const region = regions.find((r) => r.code === country);

  async function validate() {
    if (!shipmentId) { setMessage({ tone: 'error', text: 'Pick a shipment first.' }); return; }
    setBusy('validate'); setMessage(null); setValidation(null);
    try {
      const d = await api<{ declaration: AsycudaDeclaration; errors: FormIssue[]; warnings: FormIssue[] }>('/api/asycuda/validate', {
        method: 'POST',
        body: JSON.stringify({ shipmentId, country, office, officeOfEntry: officeOfEntry || office, declarationType, currencyCode, exchangeRate: Number(exchangeRate) || undefined, locationOfGoods }),
      });
      setValidation(d);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Validation failed.' });
    } finally { setBusy(null); }
  }

  async function generate() {
    if (!shipmentId) { setMessage({ tone: 'error', text: 'Pick a shipment first.' }); return; }
    setBusy('generate'); setMessage(null);
    try {
      await api('/api/asycuda/generate', {
        method: 'POST',
        body: JSON.stringify({ shipmentId, country, office, officeOfEntry: officeOfEntry || office, declarationType, currencyCode, exchangeRate: Number(exchangeRate) || undefined, locationOfGoods }),
      });
      setMessage({ tone: 'ok', text: 'SAD XML generated and stored encrypted in the vault. Download it and lodge it on the administration portal with your declarant account.' });
      setValidation(null);
      await reload();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not generate the XML.' });
    } finally { setBusy(null); }
  }

  async function transition(f: FilingRow, status: string) {
    try {
      await api(`/api/asycuda/filings/${f.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Transition rejected.' });
    }
  }

  function downloadXml(f: FilingRow) {
    fetch(`/api/asycuda/filings/${f.id}/xml`, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error?.message || 'Download failed.');
        }
        return res.blob();
      })
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `SAD-${f.country}-${f.shipment?.reference || f.id}.xml`;
        a.click(); URL.revokeObjectURL(a.href);
      })
      .catch((err) => setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Download failed.' }));
  }

  const canValidate = !!shipmentId && !!country;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FileCheck2 className="h-6 w-6 text-primary" /> e-Filing — ASYCUDA World</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build, validate and file customs declarations for Caribbean ASYCUDA administrations from your real shipment
          and landed-cost data. The SAD XML is encrypted, checksummed and versioned; the customs response (entry number,
          assessment, payment) is recorded step by step. Nothing is auto-submitted — lodgement is done by the registered
          declarant on each administration&apos;s portal.
        </p>
      </header>

      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Declaration builder ── */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> New declaration</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Shipment</span>
              <select className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm" value={shipmentId} onChange={(e) => { setShipmentId(e.target.value); setValidation(null); }}>
                <option value="">— select —</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.reference}{s.clientName ? ` · ${s.clientName}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Customs administration</span>
              <select className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm" value={country} onChange={(e) => { setCountry(e.target.value); setValidation(null); }}>
                {regions.map((r) => <option key={r.code} value={r.code}>{r.country} — {r.administration}</option>)}
              </select>
              {region && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {region.systemNote} <span className="opacity-70">({region.form.toUpperCase()} · {region.currency})</span>
                </p>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground">Clearance office (box A)</span>
                <Input className="mt-1" value={office} onChange={(e) => setOffice(e.target.value)} placeholder="e.g. Port of Spain" />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Office of entry (box 29)</span>
                <Input className="mt-1" value={officeOfEntry} onChange={(e) => setOfficeOfEntry(e.target.value)} placeholder="same as box A" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground">Declaration type (box 1)</span>
                <select className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm" value={declarationType} onChange={(e) => setDeclarationType(e.target.value)}>
                  {declTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Invoice currency (box 22)</span>
                <Input className="mt-1" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-muted-foreground">Exchange rate — {region?.currency || 'national'} per USD (box 23)</span>
              <Input className="mt-1" type="number" step="0.0001" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder={country === 'TT' ? 'default: tenant TTD rate' : 'required'} />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Location of goods (box 30)</span>
              <Input className="mt-1" value={locationOfGoods} onChange={(e) => setLocationOfGoods(e.target.value)} placeholder="terminal / warehouse where goods sit" />
            </label>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" disabled={!canValidate || busy !== null} onClick={validate}>
                {busy === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Validate
              </Button>
              <Button className="flex-1" disabled={!canValidate || busy !== null} onClick={generate}>
                {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />} Generate SAD XML
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Validation never invents data: missing mandatory boxes come back as errors; review items as warnings.
            </p>
          </CardContent>
        </Card>

        {/* ── Validation result + filings ── */}
        <div className="space-y-4">
          {validation && (
            <Card>
              <CardHeader><CardTitle className="text-base">Validation — {validation.declaration.country} · {validation.declaration.general.boxDeclarationType} · ref {validation.declaration.general.boxReferenceNumber}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <IssueList title="Blocking errors" issues={validation.errors} tone="error" />
                <IssueList title="Review warnings" issues={validation.warnings} tone="warn" />
                {!validation.errors.length && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Declaration passes all box-level checks — ready to generate the SAD XML.
                  </div>
                )}
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Items (box 5)</p><p className="text-lg font-semibold">{validation.declaration.totals.itemsCount}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Customs value ({region?.currency || 'national'})</p><p className="text-lg font-semibold">{validation.declaration.totals.statisticalTotal.toLocaleString()}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Duties &amp; taxes (box 47)</p><p className="text-lg font-semibold">{validation.declaration.totals.totalDutyTaxes.toLocaleString()}</p></div>
                </div>
                {validation.declaration.items[0]?.taxes.length > 0 && (
                  <Table>
                    <TableHeader><TableRow><TableHead>Tax (box 47)</TableHead><TableHead>Base</TableHead><TableHead>Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {validation.declaration.items[0].taxes.map((t, k) => (
                        <TableRow key={k}>
                          <TableCell className="font-medium">{t.taxType}</TableCell>
                          <TableCell>{t.taxBase.toLocaleString()}</TableCell>
                          <TableCell>{t.taxRate}</TableCell>
                          <TableCell className="text-right">{t.taxAmount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Filings ({filings.length})</CardTitle></CardHeader>
            <CardContent>
              {!filings.length && <p className="text-sm text-muted-foreground">No filings yet — validate a shipment and generate its SAD XML.</p>}
              <div className="space-y-3">
                {filings.map((f) => {
                  let timeline: TimelineEntry[] = [];
                  try { timeline = JSON.parse(f.timelineJson || '[]'); } catch { timeline = []; }
                  const open = expanded === f.id;
                  return (
                    <div key={f.id} className="rounded-lg border">
                      <div className="flex flex-wrap items-center gap-2 p-3">
                        <StatusBadge status={f.status} label={f.statusLabel} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.shipment?.reference || '—'} · {f.country} · {f.declarationType}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            office {f.office || '—'}{f.registrationNumber ? ` · entry ${f.registrationNumber}` : ''}{f.assessedTotal != null ? ` · assessed ${f.assessedTotal.toLocaleString()}` : ''}
                          </p>
                        </div>
                        {f.xmlChecksum && <Button size="sm" variant="outline" onClick={() => downloadXml(f)}><Download className="h-3.5 w-3.5" /> XML</Button>}
                        {f.status === 'xml_generated' && <Button size="sm" variant="outline" onClick={() => transition(f, 'filed')}><Send className="h-3.5 w-3.5" /> Mark filed</Button>}
                        {['filed', 'registered', 'assessed'].includes(f.status) && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline"><Stamp className="h-3.5 w-3.5" /> Record CUSRES</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <AckDialog filing={f} onDone={reload} />
                            </DialogContent>
                          </Dialog>
                        )}
                        {f.status === 'rejected' && <Button size="sm" variant="outline" onClick={() => transition(f, 'draft')}><RotateCcw className="h-3.5 w-3.5" /> Back to draft</Button>}
                        {!['cleared', 'rejected'].includes(f.status) && (
                          <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => transition(f, 'rejected')}><Ban className="h-3.5 w-3.5" /></Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : f.id)}>
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                      {open && (
                        <div className="border-t p-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Timeline</p>
                          <ol className="space-y-1">
                            {timeline.map((t, k) => (
                              <li key={k} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{t.status}</span> · {fmtDateTime(t.at)} · {t.byName}{t.note ? ` — ${t.note}` : ''}
                              </li>
                            ))}
                          </ol>
                          {f.xmlChecksum && <p className="text-xs text-muted-foreground">XML checksum: <span className="font-mono">{f.xmlChecksum.slice(0, 32)}…</span></p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Regional coverage ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe2 className="h-4 w-4" /> Caribbean coverage — laws, protocols and e-filing channels</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every administration below runs ASYCUDA and shares the CARICOM Common External Tariff framework; duty/VAT
            actually charged comes from each country&apos;s tariff and fiscal notes, so rate tables outside Trinidad &amp; Tobago
            must be calibrated (Settings → Rate configuration) before quoting.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Administration · system</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Ccy</TableHead>
                  <TableHead>e-Filing channel</TableHead>
                  <TableHead>Readiness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regions.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-medium">{r.country}</TableCell>
                    <TableCell className="max-w-[340px]">
                      <p className="text-sm">{r.administration}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.systemNote}</p>
                      {r.efilingPortalUrl && (
                        <a className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={r.efilingPortalUrl} target="_blank" rel="noreferrer">
                          {r.efilingPortalUrl.replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell>{r.form.toUpperCase()}</TableCell>
                    <TableCell>{r.vatRate != null ? `${r.vatRate}%${r.vatVerified ? '' : '*'}` : '—'}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="max-w-[220px] text-xs">{r.efilingChannel}</TableCell>
                    <TableCell><Badge className={CALIBRATION_LABEL[r.calibration].cls}>{CALIBRATION_LABEL[r.calibration].label}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            * Rate stated by public sources but not yet calibrated in the engine — verify per tariff line before quoting.
            Trinidad &amp; Tobago is fully calibrated (August 2026 fiscal package, LN 247/2024 · LN 479/2025 · LN 613/2026).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AckDialog({ filing, onDone }: { filing: FilingRow; onDone: () => void }) {
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationDate, setRegistrationDate] = useState('');
  const [assessmentNumber, setAssessmentNumber] = useState('');
  const [assessedTotal, setAssessedTotal] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [cusresXml, setCusresXml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api(`/api/asycuda/filings/${filing.id}/ack`, {
        method: 'POST',
        body: JSON.stringify({
          registrationNumber: registrationNumber || undefined,
          registrationDate: registrationDate || undefined,
          assessmentNumber: assessmentNumber || undefined,
          assessedTotal: assessedTotal ? Number(assessedTotal) : undefined,
          receiptNumber: receiptNumber || undefined,
          cusresXml: cusresXml || undefined,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the response.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Stamp className="h-4 w-4" /> Record customs response — {filing.shipment?.reference}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        ASYCUDA assigns the registration number (e.g. <span className="font-mono">C 427</span>) when the declaration is
        validated, then the assessment (accounting box B) and the payment receipt. Paste the portal&apos;s CUSRES XML or
        type the values — CaribClear records them with who/when in the tamper-evident timeline.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm"><span className="text-muted-foreground">Registration number</span><Input className="mt-1" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="C 427" /></label>
        <label className="block text-sm"><span className="text-muted-foreground">Registration date</span><Input className="mt-1" type="date" value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-muted-foreground">Assessment number</span><Input className="mt-1" value={assessmentNumber} onChange={(e) => setAssessmentNumber(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-muted-foreground">Assessed total ({filing.currencyCode})</span><Input className="mt-1" type="number" step="0.01" value={assessedTotal} onChange={(e) => setAssessedTotal(e.target.value)} /></label>
        <label className="block text-sm col-span-2"><span className="text-muted-foreground">Receipt number (payment)</span><Input className="mt-1" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} /></label>
      </div>
      <label className="block text-sm">
        <span className="text-muted-foreground">…or paste the CUSRES response XML</span>
        <Textarea className="mt-1 font-mono text-xs" rows={4} value={cusresXml} onChange={(e) => setCusresXml(e.target.value)} placeholder="<CUSRES>…</CUSRES>" />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stamp className="h-4 w-4" />} Record</Button>
      </div>
    </div>
  );
}
