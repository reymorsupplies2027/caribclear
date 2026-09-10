'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isOfflineFailure, enqueueOp } from '@/lib/offline/outbox';
import type { C82Form, C84Form, CaricomCoForm, FormIssue } from '@/lib/engine/forms';
import { Printer, Save, FileText, AlertTriangle, ShieldCheck, Loader2, ScrollText, Globe2, Landmark } from 'lucide-react';

/**
 * Forms Studio — builds official T&T / CARICOM customs forms from REAL
 * shipment data: Form C82 (T&T goods declaration, Legal Notice 72/1993),
 * Form C73 (regional declaration — Jamaica/Guyana/Barbados), Form C84
 * (claims under specific customs procedures) and the CARICOM Certificate
 * of Origin. Drafts are review-and-lodge aids for the broker: nothing is
 * auto-submitted to Customs.
 */

type FormPayload = C82Form | C84Form | CaricomCoForm;
const KINDS = [
  { id: 'c82', label: 'C82 — T&T declaration', hint: 'Customs Declaration (Import/Export), Chap. 78:01' },
  { id: 'c73', label: 'C73 — Regional', hint: 'Jamaica · Guyana · Barbados entry form' },
  { id: 'c84', label: 'C84 — Special claims', hint: 'Concessions, exemptions, undertakings' },
  { id: 'caricom-co', label: 'CARICOM CO', hint: 'Certificate of Origin — CARICOM member states' },
] as const;
type Kind = (typeof KINDS)[number]['id'];

interface ShipmentLite { id: string; reference: string; goodsDescription: string; status: string; clientName: string | null }

export default function FormsPage() {
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [shipmentId, setShipmentId] = useState('');
  const [kind, setKind] = useState<Kind>('c82');
  const [form, setForm] = useState<FormPayload | null>(null);
  const [errors, setErrors] = useState<FormIssue[]>([]);
  const [warnings, setWarnings] = useState<FormIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api<{ shipments: Array<ShipmentLite & { client: { name: string; company: string } | null }> }>('/api/shipments')
      .then((d) => setShipments(d.shipments.map((s) => ({ ...s, clientName: s.client?.company || s.client?.name || null }))))
      .catch(() => setShipments([]));
  }, []);

  const build = useCallback(async (sid: string, k: Kind) => {
    if (!sid) return;
    setLoading(true); setSaved(null);
    try {
      const d = await api<{ form: FormPayload; errors: FormIssue[]; warnings: FormIssue[] }>(
        `/api/forms/build?kind=${k}&shipmentId=${encodeURIComponent(sid)}`,
      );
      setForm(d.form); setErrors(d.errors); setWarnings(d.warnings);
    } catch (err) {
      setForm(null);
      setErrors([{ field: 'build', message: err instanceof Error ? err.message : 'Could not build the form.' }]);
      setWarnings([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { build(shipmentId, kind); }, [shipmentId, kind, build]);

  function patchC82(fn: (f: C82Form) => C82Form) { setForm((p) => (p && p.kind === 'c82' ? fn(p) : p)); }
  function patchC84(fn: (f: C84Form) => C84Form) { setForm((p) => (p && p.kind === 'c84' ? fn(p) : p)); }
  function patchCo(fn: (f: CaricomCoForm) => CaricomCoForm) { setForm((p) => (p && p.kind === 'caricom-co' ? fn(p) : p)); }

  async function saveToVault() {
    if (!form) return;
    setSaving(true);
    try {
      const d = await api<{ document: { id: string; title: string } }>('/api/forms/build', {
        method: 'POST', body: JSON.stringify({ kind, shipmentId, payload: form }),
      });
      setSaved(d.document.title);
    } catch (err) {
      if (isOfflineFailure(err)) {
        await enqueueOp({
          url: '/api/forms/build',
          method: 'POST',
          body: JSON.stringify({ kind, shipmentId, payload: form }),
          label: `Form ${kind.toUpperCase()} — queued offline`,
        });
        setSaved(`Form ${kind.toUpperCase()} queued offline — it will be stored automatically when the connection returns.`);
      } else {
        setErrors((e) => [...e, { field: 'save', message: err instanceof Error ? err.message : 'Save failed.' }]);
      }
    } finally { setSaving(false); }
  }

  const filteredShipments = useMemo(() => {
    const f = filter.toLowerCase();
    const list = filter
      ? shipments.filter((s) => s.reference.toLowerCase().includes(f) || (s.clientName || '').toLowerCase().includes(f) || s.goodsDescription.toLowerCase().includes(f))
      : shipments;
    return list.slice(0, 60);
  }, [shipments, filter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="no-print space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6 text-teal-600" /> Forms studio</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Official customs forms generated from your real shipment data — review, edit, save to the vault, print for lodgement.
            </p>
          </div>
          {form && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print / Save PDF</Button>
              <Button onClick={saveToVault} disabled={saving || errors.length > 0} className="gap-2 bg-teal-600 hover:bg-teal-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to vault
              </Button>
            </div>
          )}
        </header>

        {/* Pickers */}
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Shipment</div>
              <Input placeholder="Filter by reference, client, goods…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {!shipments.length && <p className="text-sm text-muted-foreground p-2">No shipments yet — create one first.</p>}
                {filteredShipments.map((s) => (
                  <button key={s.id} onClick={() => setShipmentId(s.id)}
                    className={cn('w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors',
                      shipmentId === s.id ? 'border-teal-500 bg-teal-600/10' : 'hover:bg-muted/60')}>
                    <div className="font-semibold flex items-center justify-between gap-2">{s.reference}
                      <Badge variant="secondary" className="text-[10px]">{s.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{s.clientName || 'No client'} · {s.goodsDescription}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Form</div>
              {KINDS.map((k) => (
                <button key={k.id} onClick={() => setKind(k.id)} disabled={!shipmentId}
                  className={cn('w-full text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-40',
                    kind === k.id ? 'border-teal-500 bg-teal-600/10' : 'hover:bg-muted/60')}>
                  <div className="text-sm font-semibold">{k.label}</div>
                  <div className="text-xs text-muted-foreground">{k.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {!shipmentId && (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Pick a shipment to build its forms. Everything is prefilled from your data: containers, B/L, client, HS code and the last landed-cost run.
              </div>
            )}
            {loading && (
              <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Building form from real data…
              </div>
            )}
            {(errors.length > 0 || warnings.length > 0) && !loading && (
              <div className="space-y-2">
                {errors.map((e, i) => (
                  <div key={i} className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <span><b className="font-semibold">Missing / invalid:</b> {e.message}</span>
                  </div>
                ))}
                {warnings.map((w, i) => (
                  <div key={i} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span><b className="font-semibold">Review:</b> {w.message}</span>
                  </div>
                ))}
              </div>
            )}
            {saved && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2 text-sm flex gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Saved to the vault as <b>{saved}</b> — encrypted, versioned, linked to this shipment.</span>
              </div>
            )}

            {/* Editable fields */}
            {form && form.kind === 'c82' && !loading && (
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">3 · Edit before lodgement</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Entry number (Customs declaration no.)" value={form.entryNumber} onChange={(v) => patchC82((f) => ({ ...f, entryNumber: v }))} />
                  <Field label="Exporter / Consignor (box 1)" value={form.box1ExporterConsignor} onChange={(v) => patchC82((f) => ({ ...f, box1ExporterConsignor: v }))} />
                  <Field label="Importer / Consignee (box 5)" value={form.box5ImporterConsignee} onChange={(v) => patchC82((f) => ({ ...f, box5ImporterConsignee: v }))} />
                  <Field label="Declarant (box 13)" value={form.box13Declarant} onChange={(v) => patchC82((f) => ({ ...f, box13Declarant: v }))} />
                  <Field label="Transport document (box 7)" value={form.box7TransportDocument} onChange={(v) => patchC82((f) => ({ ...f, box7TransportDocument: v }))} />
                  <Field label="Transacting bank (box 14)" value={form.box14TransactingBank} onChange={(v) => patchC82((f) => ({ ...f, box14TransactingBank: v }))} />
                  <Field label={`CPC item 1 (box 26)`} value={form.items[0]?.cpc || ''} onChange={(v) => patchC82((f) => ({ ...f, items: f.items.map((it, i) => i === 0 ? { ...it, cpc: v } : it) }))} />
                  <Field label="Marks and numbers (box 33)" value={form.items[0]?.marksAndNumbers || ''} onChange={(v) => patchC82((f) => ({ ...f, items: f.items.map((it, i) => i === 0 ? { ...it, marksAndNumbers: v } : it) }))} />
                  <Field label="Net mass kg (box 28)" type="number" value={String(form.items[0]?.netKg ?? '')} onChange={(v) => patchC82((f) => ({ ...f, items: f.items.map((it, i) => i === 0 ? { ...it, netKg: v === '' ? null : Number(v) } : it) }))} />
                  <Field label="Gross mass kg (box 29)" type="number" value={String(form.items[0]?.grossKg ?? '')} onChange={(v) => patchC82((f) => ({ ...f, items: f.items.map((it, i) => i === 0 ? { ...it, grossKg: v === '' ? null : Number(v) } : it) }))} />
                </div>
              </div>
            )}
            {form && form.kind === 'c84' && !loading && (
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">3 · Edit before lodgement</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Linked declaration no. & date (C82/C73)" value={form.declarationNoAndDate} onChange={(v) => patchC84((f) => ({ ...f, declarationNoAndDate: v }))} />
                  <Field label="Declarant" value={form.declarantName} onChange={(v) => patchC84((f) => ({ ...f, declarantName: v }))} />
                  <Field label="Importer / Exporter" value={form.importerExporter} onChange={(v) => patchC84((f) => ({ ...f, importerExporter: v }))} />
                  <Field label="Regime code" value={form.regimeCode} onChange={(v) => patchC84((f) => ({ ...f, regimeCode: v }))} />
                  <Field label="Claim — CPC (item 1)" value={form.claims[0]?.cpc || ''} onChange={(v) => patchC84((f) => ({ ...f, claims: f.claims.map((c, i) => i === 0 ? { ...c, cpc: v } : c) }))} />
                  <Field label="Claim — legal basis (item 1)" value={form.claims[0]?.claimBasis || ''} onChange={(v) => patchC84((f) => ({ ...f, claims: f.claims.map((c, i) => i === 0 ? { ...c, claimBasis: v } : c) }))} />
                </div>
              </div>
            )}
            {form && form.kind === 'caricom-co' && !loading && (
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">3 · Edit before lodgement</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Certificate number" value={form.certificateNo} onChange={(v) => patchCo((f) => ({ ...f, certificateNo: v }))} />
                  <Field label="Issued in (country)" value={form.issuedIn} onChange={(v) => patchCo((f) => ({ ...f, issuedIn: v }))} />
                  <Field label="Consignor / Exporter (box 1)" value={form.box1ConsignorExporter} onChange={(v) => patchCo((f) => ({ ...f, box1ConsignorExporter: v }))} />
                  <Field label="Consignee (box 2)" value={form.box2Consignee} onChange={(v) => patchCo((f) => ({ ...f, box2Consignee: v }))} />
                  <Field label="Country of origin (box 4)" value={form.box4CountryOfOrigin} onChange={(v) => patchCo((f) => ({ ...f, box4CountryOfOrigin: v }))} />
                  <Field label="Invoice number" value={form.invoiceNumber} onChange={(v) => patchCo((f) => ({ ...f, invoiceNumber: v }))} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview */}
      {form && !loading && (
        <div className="print-area mt-6">
          <div className="print-sheet rounded-xl" data-kind={form.kind}>
            {form.kind === 'c82' && <C82Sheet form={form} />}
            {form.kind === 'c84' && <C84Sheet form={form} />}
            {form.kind === 'caricom-co' && <CoSheet form={form} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-8 text-sm" />
    </label>
  );
}

function Cell({ n, label, value, className }: { n?: number; label: string; value: string | number; className?: string }) {
  return (
    <div className={cn('doc-cell', className)}>
      <span className="doc-label">{n ? `${n}. ${label}` : label}</span>
      <span className="doc-value">{String(value ?? '')}</span>
    </div>
  );
}

function Head({ title, footer, right }: { title: string; footer: string; right?: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          <div>
            <div className="font-bold text-sm leading-tight">REPUBLIC OF TRINIDAD AND TOBAGO — Customs and Excise Division</div>
            <div className="text-[10px] text-slate-600">{footer}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600"><Globe2 className="h-3.5 w-3.5" /> CaribClear draft · {right || ''}</div>
      </div>
      <div className="doc-border px-3 py-2 mb-3">
        <div className="font-bold text-base tracking-wide flex items-center gap-2"><FileText className="h-4 w-4" /> {title}</div>
      </div>
    </>
  );
}

function C82Sheet({ form }: { form: C82Form }) {
  return (
    <>
      <Head title={form.formTitle} footer={form.formFooter} right={`${form.entryNumber || 'ENTRY NO. —'} · ${form.entryDate}`} />
      <div className="grid grid-cols-3 gap-0 doc-border mb-0">
        <Cell n={1} label="Exporter / Consignor" value={form.box1ExporterConsignor} />
        <Cell n={2} label="Regime" value={form.box2Regime} />
        <div className="doc-cell grid grid-cols-2">
          <Cell n={3} label="No. of sheets" value={form.box3NumberOfSheets} />
          <Cell n={4} label="No. of items" value={form.box4NumberOfItems} />
        </div>
        <Cell n={5} label="Importer / Consignee" value={form.box5ImporterConsignee} />
        <Cell n={6} label="Total packages" value={form.box6TotalPackages} />
        <Cell n={7} label="Transport document" value={form.box7TransportDocument} />
        <Cell n={13} label="Declarant" value={form.box13Declarant} />
        <Cell n={14} label="Transacting bank" value={form.box14TransactingBank} />
        <Cell n={16} label="Consignee" value={form.box16Consignee} />
      </div>

      <table className="mb-0">
        <tbody>
          <tr>
            <td className="doc-cell w-1/2"><span className="doc-label">17. TOTAL CIF / FOB (TT$)</span><span className="doc-value text-sm">{form.box17TotalCifTtd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></td>
            <td className="doc-cell w-1/2"><span className="doc-label">24. TOTAL TAXES THIS DECLARATION (TT$)</span><span className="doc-value text-sm">{form.box24TotalTaxesTtd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></td>
          </tr>
          <tr>
            <td className="doc-cell" colSpan={2}>
              <span className="doc-label">18. Means of transport · 19. Agent of carrier · 20. Port of import/export</span>
              <span className="doc-value">
                {form.box18MeansOfTransport.mode} / {form.box18MeansOfTransport.type} — {form.box18MeansOfTransport.rotation || '—'}
                {' · '}Agent: {form.box19AgentOfCarrier || '—'}
                {' · '}{form.box20PortOfImportExport || '—'}
              </span>
            </td>
          </tr>
          {form.box23OtherCharges.length > 0 && (
            <tr>
              <td className="doc-cell" colSpan={2}>
                <span className="doc-label">23. Other charges</span>
                <span className="doc-value">{form.box23OtherCharges.map((c) => `${c.type} (${c.code}): TT$${c.amount.toFixed(2)}`).join(' · ')}</span>
              </td>
            </tr>
          )}
          <tr>
            <td className="doc-cell" colSpan={2}><span className="doc-label">22. Additional information</span><span className="doc-value">{form.box22AdditionalInformation || '—'}</span></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3">
        {form.items.map((it) => (
          <div key={it.item} className="doc-border p-2 mb-2">
            <div className="grid grid-cols-12 gap-0 mb-1">
              <div className="col-span-6 doc-cell"><span className="doc-label">25. Description of goods — item {it.item}</span><span className="doc-value">{it.description}</span></div>
              <div className="col-span-3 doc-cell"><span className="doc-label">26. CPC</span><span className="doc-value">{it.cpc}</span></div>
              <div className="col-span-3 doc-cell"><span className="doc-label">27. Commodity code</span><span className="doc-value">{it.commodityCode}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">28. Net mass (kg)</span><span className="doc-value">{it.netKg ?? ''}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">29. Gross mass (kg)</span><span className="doc-value">{it.grossKg ?? ''}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">30. Suppl. qty 1</span><span className="doc-value">{it.supplQty1}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">34. Freight</span><span className="doc-value">{it.freightTtd.toFixed(2)}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">35. Insurance</span><span className="doc-value">{it.insuranceTtd.toFixed(2)}</span></div>
              <div className="col-span-2 doc-cell"><span className="doc-label">37. Customs value (TT$)</span><span className="doc-value">{it.customsValueTtd.toFixed(2)}</span></div>
              <div className="col-span-12 doc-cell"><span className="doc-label">33. Marks and numbers</span><span className="doc-value">{it.marksAndNumbers || '—'}</span></div>
              <div className="col-span-6 doc-cell"><span className="doc-label">45. Country of origin</span><span className="doc-value">{it.originCountry || '—'}</span></div>
              <div className="col-span-6 doc-cell"><span className="doc-label">46. Country of destination</span><span className="doc-value">{it.destinationCountry || '—'}</span></div>
            </div>
            <table>
              <thead>
                <tr className="text-left">
                  <th className="doc-cell doc-label w-1/4">38. Duty/Tax code</th>
                  <th className="doc-cell doc-label">39. Base amount (TT$)</th>
                  <th className="doc-cell doc-label">40. Rate</th>
                  <th className="doc-cell doc-label">41. Amount (TT$)</th>
                </tr>
              </thead>
              <tbody>
                {it.taxes.map((t, i) => (
                  <tr key={i}>
                    <td className="doc-cell doc-value">{t.code}</td>
                    <td className="doc-cell doc-value">{t.baseAmount.toFixed(2)}</td>
                    <td className="doc-cell doc-value">{t.rate}</td>
                    <td className="doc-cell doc-value">{t.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="doc-cell" colSpan={3}><span className="doc-label">47. Total duties and taxes for this item</span></td>
                  <td className="doc-cell doc-value">{it.totalTaxesTtd.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="doc-cell">
          <span className="doc-label">48. Declaration</span>
          <p className="mt-1">{form.box48DeclarationText}</p>
          <p className="mt-4 text-[10px] text-slate-600">Signature of declarant: ...........................................<br />Date: ...........................</p>
        </div>
        <div className="doc-cell">
          <span className="doc-label">For official use — assessment notice</span>
          <p className="mt-4 text-[10px] text-slate-600">Officer's signature &amp; stamp: ...........................................<br />Date: ...........................</p>
        </div>
      </div>
      <p className="mt-3 text-[9px] text-slate-600 border-t pt-2">{form.legalWarning}</p>
      <p className="mt-1 text-[8.5px] text-slate-500">Generated by CaribClear from shipment data · {fmtDateTime(form.generatedFrom.builtAt)} · draft for broker review — not yet lodged with Customs.</p>
    </>
  );
}

function C84Sheet({ form }: { form: C84Form }) {
  return (
    <>
      <Head title="DECLARATION IN RESPECT OF CLAIMS FOR TREATMENT UNDER SPECIFIC CUSTOMS PROCEDURES — Form C84 (Schedule I)"
        footer="Legal Notice 72 of 1993, Customs (Amendment) Regulations, Chap. 78:01."
        right={form.refNo} />
      <div className="grid grid-cols-2 gap-0 doc-border">
        <Cell label="Customs declaration no. and date" value={form.declarationNoAndDate} />
        <Cell label="Regime code" value={form.regimeCode} />
        <Cell label="Declarant's name" value={form.declarantName} />
        <Cell label="Ref. no." value={form.refNo} />
        <Cell label="Importer / Exporter" value={form.importerExporter} className="col-span-2" />
      </div>
      <table className="mt-3">
        <thead>
          <tr className="text-left">
            <th className="doc-cell doc-label w-16">Item</th>
            <th className="doc-cell doc-label">CPC</th>
            <th className="doc-cell doc-label">Description</th>
            <th className="doc-cell doc-label">Claim / basis</th>
          </tr>
        </thead>
        <tbody>
          {form.claims.map((c) => (
            <tr key={c.itemNo}>
              <td className="doc-cell doc-value">{c.itemNo}</td>
              <td className="doc-cell doc-value">{c.cpc}</td>
              <td className="doc-cell doc-value">{c.description}</td>
              <td className="doc-cell doc-value">{c.claimBasis || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-cell mt-3">
        <span className="doc-label">Declaration</span>
        <p className="mt-1">{form.declarationText}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="doc-cell"><span className="doc-label">Signature of declarant / representative</span>
          <p className="mt-4 text-[10px] text-slate-600">...........................................<br />Date: ...........................</p></div>
        <div className="doc-cell"><span className="doc-label">For official use — Comptroller of Customs and Excise</span>
          <p className="mt-4 text-[10px] text-slate-600">Approved / Referred: ...........................................<br />Date: ...........................</p></div>
      </div>
      <p className="mt-3 text-[9px] text-slate-600 border-t pt-2">{form.legalNote}</p>
      <p className="mt-1 text-[8.5px] text-slate-500">Generated by CaribClear · {fmtDateTime(form.generatedFrom.builtAt)} · draft for broker review.</p>
    </>
  );
}

function CoSheet({ form }: { form: CaricomCoForm }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          <div>
            <div className="font-bold text-sm leading-tight">CARICOM CERTIFICATE OF ORIGIN</div>
            <div className="text-[10px] text-slate-600">Issued in {form.issuedIn || '—'} · No. {form.certificateNo || '—'}</div>
          </div>
        </div>
        <div className="text-[10px] text-slate-600">CaribClear draft · {form.generatedFrom.shipmentReference}</div>
      </div>
      <div className="grid grid-cols-2 gap-0 doc-border">
        <Cell n={1} label="Consignor / Exporter (name, address, country)" value={form.box1ConsignorExporter} />
        <Cell n={2} label="Consignee (name, address, country)" value={form.box2Consignee} />
        <Cell n={3} label="Means of transport / route" value={form.box3TransportRoute} className="col-span-2" />
        <Cell n={4} label="Country / territory of origin (CARICOM member)" value={form.box4CountryOfOrigin} />
        <Cell n={5} label="Port / place of loading → destination" value={`${form.box5PortOfLoading || '—'} → ${form.box5PlaceOfDestination || '—'}`} />
      </div>
      <table className="mt-3">
        <thead>
          <tr className="text-left">
            <th className="doc-cell doc-label">Marks &amp; numbers</th>
            <th className="doc-cell doc-label">Packages</th>
            <th className="doc-cell doc-label">Description of goods</th>
            <th className="doc-cell doc-label">HS code</th>
            <th className="doc-cell doc-label">Gross weight (kg)</th>
            <th className="doc-cell doc-label">Invoice value (US$)</th>
          </tr>
        </thead>
        <tbody>
          {form.goods.map((g, i) => (
            <tr key={i}>
              <td className="doc-cell doc-value">{g.marksAndNumbers}</td>
              <td className="doc-cell doc-value">{[g.numberOfPackages, g.kindOfPackages].filter(Boolean).join(' ')}</td>
              <td className="doc-cell doc-value">{g.description}</td>
              <td className="doc-cell doc-value">{g.hsCode}</td>
              <td className="doc-cell doc-value">{g.grossWeightKg ?? ''}</td>
              <td className="doc-cell doc-value">{g.invoiceValueUsd ? g.invoiceValueUsd.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-cell mt-3">
        <span className="doc-label">Commercial invoice</span>
        <span className="doc-value">{form.invoiceNumber || '—'}{form.invoiceDate ? ` · dated ${form.invoiceDate}` : ''}</span>
      </div>
      <div className="doc-cell mt-3">
        <span className="doc-label">Declaration by the exporter</span>
        <p className="mt-1">{form.exporterDeclarationText}</p>
        <p className="mt-4 text-[10px] text-slate-600">Signature of exporter / authorised representative: ...........................................<br />Date: ...........................</p>
      </div>
      <div className="doc-cell mt-3">
        <span className="doc-label">Certification</span>
        <p className="mt-1">{form.certificationText}</p>
        <p className="mt-4 text-[10px] text-slate-600">Signature and stamp of certifying body: ...........................................<br />Date: ...........................</p>
      </div>
      <p className="mt-3 text-[9px] text-slate-600 border-t pt-2">
        A CARICOM Certificate of Origin supports preferential CET treatment under the CARICOM Common External Tariff for goods qualifying under the CARICOM Rules of Origin.
      </p>
      <p className="mt-1 text-[8.5px] text-slate-500">Generated by CaribClear · {fmtDateTime(form.generatedFrom.builtAt)} · draft for exporter/broker review.</p>
    </>
  );
}
