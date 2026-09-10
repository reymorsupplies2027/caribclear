'use client';

/**
 * AI document extraction dialog — real vision OCR via /api/documents/extract.
 * Shows the structured draft (supplier, invoice no., line items, totals) for
 * broker review. Nothing is auto-committed: the broker copies what they
 * confirm. Drafts are also stored in the vault notes on demand.
 */
import { useState, useRef } from 'react';
import { api } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScanLine, Sparkles, ClipboardCopy, FileWarning } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ExtractLine { description: string; quantity?: number | null; unit?: string | null; unitPrice?: number | null; lineTotal?: number | null; hsHint?: string | null }
interface Extraction {
  documentType: string; supplier?: string | null; importer?: string | null;
  invoiceNumber?: string | null; invoiceDate?: string | null; currency?: string | null;
  lines: ExtractLine[]; subtotal?: number | null; freight?: number | null;
  insurance?: number | null; total?: number | null; containers: string[]; weightsKg?: number | null;
}
interface ExtractResponse { extraction: Extraction; meta: { model: string; source: string; lineCount: number; reviewed: boolean } }

const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf';

export function AiExtractDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(file: File | null, text: string) {
    setBusy(true); setResult(null);
    try {
      let payload: Record<string, unknown>;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        payload = { dataBase64: btoa(bin), mimeType: file.type || 'application/pdf', fileName: file.name };
      } else {
        if (text.trim().length < 10) throw new Error('Paste at least a few lines of the document text.');
        payload = { text };
      }
      const data = await api<ExtractResponse>('/api/documents/extract', { method: 'POST', body: JSON.stringify(payload) });
      setResult(data);
      toast({ title: 'Extraction ready', description: `${data.meta.lineCount} line(s) · model ${data.meta.model} · draft for review` });
    } catch (err) {
      toast({ title: 'Extraction failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  function copyJson() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.extraction, null, 2))
      .then(() => toast({ title: 'JSON copied', description: 'Paste it anywhere — the data is yours.' }))
      .catch(() => toast({ title: 'Copy failed', variant: 'destructive' }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); setPastedText(''); setFileName(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-teal-600/50 text-teal-700 dark:text-teal-400 hover:bg-teal-600/10">
          <ScanLine className="h-4 w-4 mr-1" /> AI read
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-600" /> AI document reader</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Invoice, packing list, B/L or manifest → structured data in seconds. Images, PDFs (≤10MB) or pasted text.
          The result is a <strong>draft</strong>: verify before declaring.
        </p>

        {!busy && !result && (
          <div className="space-y-3">
            <div
              role="button" tabIndex={0} aria-label="Pick a file for AI extraction"
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-6 text-center hover:border-teal-500/60 hover:bg-muted/30 transition-all"
            >
              <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" aria-hidden="true"
                onChange={e => { const f = e.target.files?.[0] ?? null; setFileName(f?.name ?? null); if (f) void run(f, ''); e.target.value = ''; }} />
              <ScanLine className="h-8 w-8 mx-auto mb-2 text-teal-600" />
              <p className="text-sm font-semibold">{fileName ? `Read: ${fileName}` : 'Drop or click: invoice photo, scan or PDF'}</p>
              <p className="text-xs text-muted-foreground mt-1">JPG · PNG · WebP · PDF — 10MB max</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or paste text</span><div className="h-px flex-1 bg-border" />
            </div>
            <textarea
              className="w-full h-28 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder={'INVOICE No. 2024-0881\n1. Stainless steel sinks 40 pcs @ US$28.50 ...\n2. ...'}
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
            />
            <Button className="w-full bg-teal-600 hover:bg-teal-700" disabled={busy}
              onClick={() => void run(null, pastedText)}>
              <Sparkles className="h-4 w-4 mr-1" /> Extract from text
            </Button>
          </div>
        )}

        {busy && (
          <div className="py-10 text-center">
            <ScanLine className="h-10 w-10 mx-auto mb-3 text-teal-600 animate-pulse" />
            <p className="text-sm font-semibold">Reading the document…</p>
            <p className="text-xs text-muted-foreground mt-1">vision OCR + structuring, typically 5-20 s</p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Fact k="Type" v={result.extraction.documentType} />
              <Fact k="Invoice #" v={result.extraction.invoiceNumber ?? '—'} />
              <Fact k="Date" v={result.extraction.invoiceDate ?? '—'} />
              <Fact k="Currency" v={result.extraction.currency ?? '—'} />
              <Fact k="Supplier" v={result.extraction.supplier ?? '—'} span />
              <Fact k="Total" v={result.extraction.total != null ? Number(result.extraction.total).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'} />
              <Fact k="Freight" v={result.extraction.freight != null ? String(result.extraction.freight) : '—'} />
              <Fact k="Weight kg" v={result.extraction.weightsKg != null ? String(result.extraction.weightsKg) : '—'} />
            </div>
            {result.extraction.containers.length > 0 && (
              <p className="text-xs text-muted-foreground">Containers: {result.extraction.containers.join(', ')}</p>
            )}
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 font-medium text-right">Qty</th>
                    <th className="p-2 font-medium text-right">Unit</th>
                    <th className="p-2 font-medium text-right">Unit price</th>
                    <th className="p-2 font-medium text-right">Line</th>
                    <th className="p-2 font-medium">HS?</th>
                  </tr>
                </thead>
                <tbody>
                  {result.extraction.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 max-w-56 truncate" title={l.description}>{l.description}</td>
                      <td className="p-2 text-right tabular-nums">{l.quantity ?? '—'}</td>
                      <td className="p-2 text-right">{l.unit ?? '—'}</td>
                      <td className="p-2 text-right tabular-nums">{l.unitPrice ?? '—'}</td>
                      <td className="p-2 text-right tabular-nums">{l.lineTotal ?? '—'}</td>
                      <td className="p-2 font-mono">{l.hsHint ?? '—'}</td>
                    </tr>
                  ))}
                  {result.extraction.lines.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No itemized lines detected.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
              <FileWarning className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                AI draft — values copied as printed by model {result.meta.model}. The broker of record must verify
                against the original before any declaration. Nothing was saved automatically.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copyJson}><ClipboardCopy className="h-4 w-4 mr-1" /> Copy JSON</Button>
              <Button variant="outline" onClick={() => { setResult(null); setFileName(null); }}>Read another</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ k, v, span }: { k: string; v: string; span?: boolean }) {
  return (
    <div className={`rounded-md bg-muted/40 p-2 ${span ? 'col-span-2' : ''}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className="font-semibold truncate" title={v}>{v}</p>
    </div>
  );
}

void Input; void Label;
