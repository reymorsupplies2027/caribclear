'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Landmark, Plus, Scale, Wallet, ArrowDownToLine, ArrowUpFromLine, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * Accounting — fiduciary view (Enterprise module).
 * TRUST (client money) and OPERATING (house money) are shown side by side and
 * NEVER netted. Outlays flow: pending → paid (ledger mirror) → billed.
 * FX rates power multi-currency invoices with per-line provenance.
 */

interface FundBalance { in: number; out: number; balance: number }
interface Summary {
  funds: { TRUST: FundBalance; OPERATING: FundBalance };
  integrity: { foreignFundsFound: boolean; mixedCurrencies: boolean };
  unbilledDisbursements: { count: number; total: number };
  feeIncomeThisMonth: number;
}
interface LedgerEntry {
  id: string; fund: string; direction: string; category: string; amount: number;
  currency: string; description: string; createdAt: string;
  shipment?: { reference: string } | null;
}
interface Disbursement {
  id: string; shipmentId: string | null; category: string; amount: number; currency: string;
  paidFrom: string; vendorRef: string | null; status: string; createdAt: string;
  shipment?: { reference: string } | null;
}
interface FxRateRow {
  id: string; baseCcy: string; quoteCcy: string; rate: number; source: string; asOf: string;
}
interface ShipmentLite { id: string; reference: string }

const TRUST_CATS = ['client_deposit', 'duty_paid', 'vat_paid', 'storage_paid', 'refund_to_client', 'other'];
const OPERATING_CATS = ['fee_income', 'subscription', 'bank_charge', 'petty_cash_topup', 'other'];
const OUTLAY_CATS = ['duty', 'vat', 'wharfage', 'delivery_order', 'storage', 'scanning', 'transport', 'other'];
const PAID_FROM = ['trust', 'operating', 'petty_cash', 'company_card'];

const money = (n: number, ccy = 'TTD') => `${ccy} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusTone = (s: string) => ({
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  paid: 'bg-teal-600/15 text-teal-700 dark:text-teal-400',
  billed: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400',
  written_off: 'bg-muted text-muted-foreground',
}[s] || 'bg-muted text-muted-foreground');

export default function AccountingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [disb, setDisb] = useState<Disbursement[]>([]);
  const [fx, setFx] = useState<FxRateRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [outlayOpen, setOutlayOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);

  const load = useCallback(async () => {
    const [s, l, d, f, sh] = await Promise.all([
      api<Summary>('/api/accounting/summary').catch(() => null),
      api<{ entries: LedgerEntry[] }>('/api/accounting/ledger?take=200').catch(() => ({ entries: [] })),
      api<{ disbursements: Disbursement[] }>('/api/accounting/disbursements').catch(() => ({ disbursements: [] })),
      api<{ rates: FxRateRow[] }>('/api/accounting/fx').catch(() => ({ rates: [] })),
      api<{ shipments: ShipmentLite[] }>('/api/shipments').catch(() => ({ shipments: [] })),
    ]);
    setSummary(s); setEntries(l.entries); setDisb(d.disbursements); setFx(f.rates);
    setShipments(sh.shipments.slice(0, 100).map(x => ({ id: x.id, reference: x.reference })));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function transitionDisb(id: string, status: string) {
    try {
      await api(`/api/accounting/disbursements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast({ title: status === 'paid' ? 'Outlay paid' : `Marked ${status}`, description: status === 'paid' ? 'A mirror entry left the fund in the ledger.' : undefined });
      load();
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  const integrityIssue = summary?.integrity.foreignFundsFound;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark className="h-6 w-6 text-primary" /> Accounting</h1>
          <p className="text-sm text-muted-foreground mt-1">Fiduciary ledger — client money (TRUST) and house money (OPERATING), never mixed. Outlays and FX with provenance.</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="outlays">Outlays{summary?.unbilledDisbursements.count ? ` (${summary.unbilledDisbursements.count} to bill)` : ''}</TabsTrigger>
          <TabsTrigger value="fx">FX rates</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-4">
          {integrityIssue && (
            <Card className="border-rose-500"><CardContent className="pt-4 text-sm text-rose-600">
              Integrity check: entries with an unknown fund value were found. They are NOT counted in either fund — contact the platform before recording more entries.
            </CardContent></Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <FundCard
              title="TRUST — client money held" icon={<Scale className="h-5 w-5" />}
              tone="text-sky-700 dark:text-sky-400 border-sky-500/40"
              b={summary?.funds.TRUST}
              note="Money collected from clients for duty/VAT/port charges. A liability: it is theirs until paid to Customs."
            />
            <FundCard
              title="OPERATING — house money" icon={<Wallet className="h-5 w-5" />}
              tone="text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
              b={summary?.funds.OPERATING}
              note="Broker's own funds: fees earned, expenses paid. This is income, not client money."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Unbilled outlays (paid, waiting for an invoice)</p>
              <p className="text-2xl font-bold mt-1">{money(summary?.unbilledDisbursements.total || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{summary?.unbilledDisbursements.count || 0} outlay(s). Bill them from Quotes → New invoice → pick the shipment.</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Fee income this month</p>
              <p className="text-2xl font-bold mt-1">{money(summary?.feeIncomeThisMonth || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">OPERATING inflows categorized as fee_income since the 1st.</p>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* ── LEDGER ── */}
        <TabsContent value="ledger" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setLedgerOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Record entry</Button>
          </div>
          <Card><CardContent className="pt-4">
            <EntryTable entries={entries} />
          </CardContent></Card>
        </TabsContent>

        {/* ── OUTLAYS ── */}
        <TabsContent value="outlays" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOutlayOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Record outlay</Button>
          </div>
          <Card><CardContent className="pt-4 space-y-2">
            {disb.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No outlays yet. Record duty cheques, wharfage, delivery orders… then mark them paid when the money leaves the fund.</p>}
            {disb.map(d => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2 text-sm">
                <Badge className={statusTone(d.status)}>{d.status}</Badge>
                <span className="font-medium capitalize w-32">{d.category.replace('_', ' ')}</span>
                <span className="font-semibold">{money(d.amount, d.currency)}</span>
                <span className="text-muted-foreground">from {d.paidFrom.replace('_', ' ')}{d.vendorRef ? ` · ${d.vendorRef}` : ''}</span>
                <span className="text-muted-foreground">{d.shipment?.reference || '—'}</span>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(d.createdAt)}</span>
                {d.status === 'pending' && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => transitionDisb(d.id, 'paid')} className="h-7 gap-1"><ArrowUpFromLine className="h-3 w-3" /> Mark paid</Button>
                    <Button size="sm" variant="ghost" onClick={() => transitionDisb(d.id, 'written_off')} className="h-7 gap-1 text-muted-foreground"><XCircle className="h-3 w-3" /> Write off</Button>
                  </span>
                )}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        {/* ── FX ── */}
        <TabsContent value="fx" className="space-y-4">
          <div className="flex justify-between items-start gap-4">
            <p className="text-sm text-muted-foreground max-w-xl">Multi-currency invoices convert through this table and cite the row used (source + date) on every converted line. Rows are keyed per day — re-entering a pair for the same date updates it.</p>
            <Button onClick={() => setFxOpen(true)} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> Add rate</Button>
          </div>
          <Card><CardContent className="pt-4 space-y-2">
            {fx.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No rates yet. Add e.g. USD→TTD 6.7967 — source &ldquo;CBTT daily fix&rdquo;.</p>}
            {fx.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2 text-sm">
                <span className="font-mono font-semibold">{r.baseCcy}→{r.quoteCcy}</span>
                <span className="font-bold">{r.rate}</span>
                <span className="text-muted-foreground">{r.source}</span>
                <span className="ml-auto text-xs text-muted-foreground">as of {fmtDate(r.asOf)}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ── Ledger entry dialog ── */}
      <LedgerDialog open={ledgerOpen} onOpenChange={setLedgerOpen} shipments={shipments} onDone={() => { setLedgerOpen(false); load(); }} />
      {/* ── Outlay dialog ── */}
      <OutlayDialog open={outlayOpen} onOpenChange={setOutlayOpen} shipments={shipments} onDone={() => { setOutlayOpen(false); load(); }} />
      {/* ── FX dialog ── */}
      <FxDialog open={fxOpen} onOpenChange={setFxOpen} onDone={() => { setFxOpen(false); load(); }} />
    </div>
  );
}

function FundCard({ title, b, tone, icon, note }: { title: string; b?: FundBalance; tone: string; icon: React.ReactNode; note: string }) {
  return (
    <Card className={tone}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 font-semibold">{icon} {title}</div>
        <p className="text-3xl font-bold mt-3">{money(b?.balance || 0)}</p>
        <div className="flex gap-6 mt-3 text-sm">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowDownToLine className="h-4 w-4" /> in {money(b?.in || 0)}</span>
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><ArrowUpFromLine className="h-4 w-4" /> out {money(b?.out || 0)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-3">{note}</p>
      </CardContent>
    </Card>
  );
}

function EntryTable({ entries }: { entries: LedgerEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground py-4 text-center">No entries yet. Record a client deposit (TRUST in) or a fee payment (OPERATING in) to start the ledger.</p>;
  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div key={e.id} className="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2 text-sm">
          <Badge className={e.fund === 'TRUST' ? 'bg-sky-600/15 text-sky-700 dark:text-sky-400' : 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'}>{e.fund}</Badge>
          <span className={`font-semibold ${e.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {e.direction === 'in' ? '+' : '−'}{money(e.amount, e.currency)}
          </span>
          <span className="capitalize text-muted-foreground w-36">{e.category.replace(/_/g, ' ')}</span>
          <span className="min-w-0 flex-1 truncate">{e.description}</span>
          <span className="text-muted-foreground">{e.shipment?.reference || ''}</span>
          <span className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function LedgerDialog({ open, onOpenChange, shipments, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; shipments: ShipmentLite[]; onDone: () => void;
}) {
  const [fund, setFund] = useState('TRUST');
  const [direction, setDirection] = useState('in');
  const [category, setCategory] = useState('client_deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TTD');
  const [fxRate, setFxRate] = useState('');
  const [description, setDescription] = useState('');
  const [shipmentId, setShipmentId] = useState('none');
  const [saving, setSaving] = useState(false);

  const cats = fund === 'TRUST' ? TRUST_CATS : OPERATING_CATS;

  async function save() {
    setSaving(true);
    try {
      await api('/api/accounting/ledger', {
        method: 'POST',
        body: JSON.stringify({
          fund, direction, category, amount: Number(amount), currency,
          fxRate: fxRate ? Number(fxRate) : undefined,
          description, shipmentId: shipmentId === 'none' ? undefined : shipmentId,
        }),
      });
      toast({ title: 'Entry recorded', description: 'Ledger entries are append-only — correct mistakes with a reversing entry.' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not record entry', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record ledger entry</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fund</Label>
              <Select value={fund} onValueChange={(v) => { setFund(v); setCategory(v === 'TRUST' ? 'client_deposit' : 'fee_income'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TRUST">TRUST — client money</SelectItem><SelectItem value="OPERATING">OPERATING — house money</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="in">in — money arrives</SelectItem><SelectItem value="out">out — money leaves</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{cats.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
          </div>
          {currency !== 'TTD' && (
            <div><Label>FX rate (local per USD, for the record)</Label><Input type="number" min="0" step="0.0001" value={fxRate} onChange={e => setFxRate(e.target.value)} placeholder="6.7967" /></div>
          )}
          <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Client deposit — customs duty advance for CC-2026-0042" /></div>
          <div><Label>Shipment {fund === 'TRUST' && direction === 'out' && <span className="text-rose-600">(required for trust outflows)</span>}</Label>
            <Select value={shipmentId} onValueChange={setShipmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.reference}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !amount || !description}>Record entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutlayDialog({ open, onOpenChange, shipments, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; shipments: ShipmentLite[]; onDone: () => void;
}) {
  const [category, setCategory] = useState('duty');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TTD');
  const [paidFrom, setPaidFrom] = useState('trust');
  const [vendorRef, setVendorRef] = useState('');
  const [shipmentId, setShipmentId] = useState('none');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api('/api/accounting/disbursements', {
        method: 'POST',
        body: JSON.stringify({
          category, amount: Number(amount), currency, paidFrom, vendorRef: vendorRef || undefined,
          shipmentId: shipmentId === 'none' ? undefined : shipmentId,
        }),
      });
      toast({ title: 'Outlay recorded', description: 'Mark it paid when the money actually leaves the fund — the ledger will mirror it.' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not record outlay', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record outlay</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTLAY_CATS.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Paid from</Label>
              <Select value={paidFrom} onValueChange={setPaidFrom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAID_FROM.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
          </div>
          <div><Label>Receipt / cheque no.</Label><Input value={vendorRef} onChange={e => setVendorRef(e.target.value)} placeholder="SWC-88412" /></div>
          <div><Label>Shipment</Label>
            <Select value={shipmentId} onValueChange={setShipmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— none —</SelectItem>
                {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.reference}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !amount}>Record outlay</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FxDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [baseCcy, setBaseCcy] = useState('USD');
  const [quoteCcy, setQuoteCcy] = useState('TTD');
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api('/api/accounting/fx', {
        method: 'POST',
        body: JSON.stringify({ baseCcy, quoteCcy, rate: Number(rate), source, asOf }),
      });
      toast({ title: 'Rate saved', description: 'Invoices will cite this row (source + date) on converted lines.' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not save rate', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add FX rate</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Base (1 unit of)</Label><Input value={baseCcy} onChange={e => setBaseCcy(e.target.value.toUpperCase())} maxLength={3} /></div>
            <div><Label>Quote</Label><Input value={quoteCcy} onChange={e => setQuoteCcy(e.target.value.toUpperCase())} maxLength={3} /></div>
          </div>
          <p className="text-xs text-muted-foreground">USD→TTD 6.7967 means 1 US dollar buys 6.7967 Trinidad dollars — the direction central banks publish.</p>
          <div><Label>Rate</Label><Input type="number" min="0" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} placeholder="6.7967" /></div>
          <div><Label>Source</Label><Input value={source} onChange={e => setSource(e.target.value)} placeholder="CBTT daily fix 2026-09-10" /></div>
          <div><Label>As of</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !rate || !source}>Save rate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
