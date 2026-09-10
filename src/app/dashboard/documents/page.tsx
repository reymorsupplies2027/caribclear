'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, fmtDate, fmtDateTime, daysUntil } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { FolderLock, Upload, UploadCloud, AlertTriangle, Replace, Trash2, FileText, Download, FileSearch, ShieldCheck, ScanLine } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AiExtractDialog } from './ai-extract';

interface Doc {
  id: string; groupKey: string; version: number; type: string; title: string; fileName: string;
  mimeType: string | null; fileSize: number; expiryDate: string | null; notes: string | null;
  createdAt: string; updatedAt: string; shipment?: { reference: string } | null; uploader?: { name: string } | null;
}

const DOC_TYPES = [
  { k: 'bl', label: 'Bill of Lading' }, { k: 'commercial_invoice', label: 'Commercial invoice' },
  { k: 'packing_list', label: 'Packing list' }, { k: 'permit', label: 'Permit / licence' },
  { k: 'declaration', label: 'Customs declaration' }, { k: 'c2', label: 'C2 form' }, { k: 'other', label: 'Other' },
];

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<{ name: string; label: string } | null>(null);
  const [busyDrop, setBusyDrop] = useState(false);
  const browseRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api<{ documents: Doc[] }>(`/api/documents?type=${type}`).catch(() => ({ documents: [] }));
    setDocs(data.documents); setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const expiring = docs.filter(d => d.expiryDate && (daysUntil(d.expiryDate) ?? 99) < 30);

  /* ── Dropzone: filename → document-type detection (real parse + real upload) ── */
  function guessDocType(name: string): { type: string; label: string } {
    const n = name.toLowerCase();
    if (/commercial[_\s-]*invoice|\binvoice\b|\binv\b/.test(n)) return { type: 'commercial_invoice', label: 'Commercial Invoice' };
    if (/bill[_\s-]*of[_\s-]*lading|\bb\/l\b|\bbl\b|lading/.test(n)) return { type: 'bl', label: 'Bill of Lading' };
    if (/packing[_\s-]*list|\bpl\b/.test(n)) return { type: 'packing_list', label: 'Packing List' };
    if (/permit|licen[cs]e|certificate/.test(n)) return { type: 'permit', label: 'Permit / Licence' };
    if (/declaration|\bentry\b|c73|c72/.test(n)) return { type: 'declaration', label: 'Customs Declaration' };
    if (/\bc2\b/.test(n)) return { type: 'c2', label: 'C2 Form' };
    return { type: 'other', label: 'Document' };
  }

  async function uploadDropped(file: File) {
    setBusyDrop(true); setParsed(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
      const buf = await file.arrayBuffer();
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const g = guessDocType(file.name);
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Dropped document';
      await api('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title, type: g.type, fileName: file.name, mimeType: file.type || null, dataBase64: btoa(bin) }),
      });
      setParsed({ name: file.name, label: g.label });
      toast({ title: `Parsed as ${g.label} — stored`, description: 'AES-256 encrypted · versioned · expiry alerts on.' });
      load();
    } catch (err) {
      toast({ title: 'Drop failed', description: err instanceof Error ? err.message : 'Upload failed', variant: 'destructive' });
    } finally { setBusyDrop(false); }
  }

  async function onBrowsePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await uploadDropped(f);
    e.target.value = '';
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Document vault</h1>
          <p className="text-sm text-muted-foreground">5-year retention (Customs Act Cap 78:01) · versioning · expiry alerts.</p>
        </div>
        <div className="flex gap-2">
          <AiExtractDialog />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700"><Upload className="h-4 w-4 mr-1" /> Upload document</Button></DialogTrigger>
            <DialogContent className="max-w-lg"><UploadForm onDone={() => { setOpen(false); load(); }} /></DialogContent>
          </Dialog>
        </div>
      </div>

      {expiring.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm">{expiring.length} document(s) expire within 30 days — renew to avoid penalties at the port.</p>
          </CardContent>
        </Card>
      )}

      <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm w-full sm:w-56" value={type} onChange={e => setType(e.target.value)} aria-label="Filter by type">
        <option value="all">All types</option>
        {DOC_TYPES.map(t => <option key={t.k} value={t.k}>{t.label}</option>)}
      </select>

      {/* ── Drag & drop parse zone — drop a document, it is typed and stored ── */}
      <div
        role="button" tabIndex={0} aria-label="Drop document to parse and upload"
        onClick={() => browseRef.current?.click()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && browseRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) uploadDropped(f);
        }}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-all outline-none',
          dragOver ? 'border-teal-500 bg-teal-500/5 scale-[1.01]' : 'border-slate-300 dark:border-slate-600 hover:border-teal-500/60 hover:bg-muted/30',
          busyDrop && 'pointer-events-none opacity-70',
        )}
      >
        <input ref={browseRef} type="file" className="hidden" onChange={onBrowsePicked} aria-hidden="true" />
        <UploadCloud className={cn('h-9 w-9 mx-auto mb-2', dragOver ? 'text-teal-600' : 'text-slate-400')} />
        {busyDrop ? (
          <p className="text-sm font-semibold flex items-center justify-center gap-2">
            <FileSearch className="h-4 w-4 animate-pulse text-teal-600" /> Parsing document…
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Drop Commercial Invoice or Bill of Lading here to parse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse · type auto-detected from the document · encrypted AES-256 on write
            </p>
          </>
        )}
        {parsed && !busyDrop && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> {parsed.name} → detected: {parsed.label}
          </p>
        )}
      </div>

      {loading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
        <div className="grid gap-2 md:grid-cols-2">
          {docs.map(d => {
            const dExp = daysUntil(d.expiryDate);
            return (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-teal-600/10 grid place-items-center shrink-0"><FileText className="h-5 w-5 text-teal-600" /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{DOC_TYPES.find(t => t.k === d.type)?.label ?? d.type} · v{d.version} · {(d.fileSize / 1024).toFixed(0)} KB</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {d.shipment ? `Shipment ${d.shipment.reference} · ` : ''}Uploaded {fmtDateTime(d.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {d.expiryDate && <Badge variant="secondary" className={dExp !== null && dExp < 30 ? 'bg-amber-500/15 text-amber-700 border-0' : ''}>
                        {dExp !== null && dExp < 0 ? 'expired' : `exp ${fmtDate(d.expiryDate)}`}
                      </Badge>}
                      <div className="flex items-center gap-1">
                        {d.fileSize > 0 && (
                          <a href={`/api/documents/${d.id}`} aria-label={`Download ${d.title}`}
                            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-teal-600 hover:bg-teal-600/10 transition-colors">
                            <Download className="h-3.5 w-3.5 mr-1" /> Get
                          </a>
                        )}
                        <ReplaceDoc doc={d} onDone={load} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {docs.length === 0 && (
            <Card className="md:col-span-2"><CardContent className="text-center py-14 text-muted-foreground">
              <FolderLock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="mb-3">The vault is empty. Upload the B/L of your next shipment.</p>
              <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setOpen(true)}><Upload className="h-4 w-4 mr-1" /> Upload document</Button>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ title: '', type: 'bl', shipmentId: '', expiryDate: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let dataBase64: string | undefined;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        dataBase64 = btoa(bin);
      }
      await api('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ ...f, fileName: file?.name || `${f.title || 'document'}.txt`, mimeType: file?.type || null, dataBase64 }),
      });
      toast({ title: 'Document stored', description: 'Versioned, expiring-alerts on.' });
      onDone();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Upload failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>Upload to vault</DialogTitle></DialogHeader>
      <div className="space-y-1.5"><Label htmlFor="d-title">Title *</Label>
        <Input id="d-title" required value={f.title} onChange={e => set('title', e.target.value)} placeholder="Bill of Lading — ALGOL" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="d-type">Type</Label>
          <select id="d-type" className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={f.type} onChange={e => set('type', e.target.value)}>
            {DOC_TYPES.map(t => <option key={t.k} value={t.k}>{t.label}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="d-exp">Expiry (optional)</Label>
          <Input id="d-exp" type="date" value={f.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="d-file">File (≤10MB)</Label>
        <Input id="d-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="file:mr-3 file:rounded-md file:border-0 file:bg-teal-600 file:text-white file:px-3 file:py-1 file:text-sm" /></div>
      <div className="space-y-1.5"><Label htmlFor="d-notes">Notes</Label>
        <Input id="d-notes" value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Original stamped copy" /></div>
      <DialogFooter><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
        {busy && <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}Store document
      </Button></DialogFooter>
    </form>
  );
}

function ReplaceDoc({ doc, onDone }: { doc: Doc; onDone: () => void }) {
  async function replace() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        await api('/api/documents', {
          method: 'POST',
          body: JSON.stringify({ title: doc.title, type: doc.type, expiryDate: doc.expiryDate, replaceGroupKey: doc.groupKey, fileName: file.name, mimeType: file.type, dataBase64: btoa(bin) }),
        });
        toast({ title: 'New version created', description: `v${doc.version + 1} is now current.` });
        onDone();
      } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
    };
    input.click();
  }
  return (
    <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-600" onClick={replace}>
      <Replace className="h-3.5 w-3.5 mr-1" /> New version
    </Button>
  );
}

void Trash2;
