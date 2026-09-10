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
import { FolderLock, Upload, UploadCloud, AlertTriangle, Replace, Trash2, FileText, Download, ShieldCheck, ScanLine, CheckCircle2, Copy, XCircle, Loader2, Files } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AiExtractDialog } from './ai-extract';

interface Doc {
  id: string; groupKey: string; version: number; type: string; title: string; fileName: string;
  mimeType: string | null; fileSize: number; expiryDate: string | null; notes: string | null;
  checksum: string | null;
  createdAt: string; updatedAt: string; shipment?: { reference: string } | null; uploader?: { name: string } | null;
}

interface QueueItem {
  id: string; name: string; size: number; detected: string;
  status: 'hashing' | 'uploading' | 'stored' | 'duplicate' | 'error';
  progress: number; error?: string; checksum?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** SHA-256 of the exact bytes — lets the vault dedupe identical files server-side. */
async function sha256Hex(file: File): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** XHR upload with real progress events (fetch cannot report upload progress). */
function uploadWithProgress(body: object, onProgress: (pct: number) => void): Promise<{ duplicate?: boolean; document?: Doc }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (json.success) resolve(json.data as { duplicate?: boolean; document?: Doc });
        else reject(new Error(json.error?.message || 'Upload failed'));
      } catch { reject(new Error('Bad server response')); }
    };
    xhr.onerror = () => reject(new Error('Network error — check your connection'));
    xhr.send(JSON.stringify(body));
  });
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyQueue, setBusyQueue] = useState(false);
  const browseRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api<{ documents: Doc[] }>(`/api/documents?type=${type}`).catch(() => ({ documents: [] }));
    setDocs(data.documents); setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const expiring = docs.filter(d => d.expiryDate && (daysUntil(d.expiryDate) ?? 99) < 30);

  /* ── Batch upload: hash → progress → store/dedupe, one file at a time in order ── */
  function guessDocType(name: string): { type: string; label: string } {
    const n = name.toLowerCase();
    if (/commercial[_\s-]*invoice|\binvoice\b|\binv\b/.test(n)) return { type: 'commercial_invoice', label: 'Commercial Invoice' };
    if (/bill[_\s-]*of[_\s-]*lading|\bb\/l\b|\bbl\b|lading/.test(n)) return { type: 'bl', label: 'Bill of Lading' };
    if (/packing[_\s-]*list|\bpl\b/.test(n)) return { type: 'packing_list', label: 'Packing List' };
    if (/permit|licen[cs]e|certificate/.test(n)) return { type: 'permit', label: 'Permit / Licence' };
    if (/declaration|\bentry\b|c73|c82|c84/.test(n)) return { type: 'declaration', label: 'Customs Declaration' };
    if (/\bc2\b/.test(n)) return { type: 'c2', label: 'C2 Form' };
    return { type: 'other', label: 'Document' };
  }

  function patchQueue(id: string, patch: Partial<QueueItem>) {
    setQueue(q => q.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function enqueueFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setBusyQueue(true);
    const items: QueueItem[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name, size: f.size, detected: guessDocType(f.name).label,
      status: 'hashing', progress: 0,
    }));
    setQueue(q => [...q, ...items]);
    let stored = 0, duplicates = 0, failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const item = items[i];
      try {
        if (file.size > MAX_BYTES) throw new Error('exceeds the 10MB limit');
        patchQueue(item.id, { status: 'hashing' });
        const checksum = await sha256Hex(file);
        patchQueue(item.id, { checksum, status: 'uploading' });
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
        const g = guessDocType(file.name);
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Dropped document';
        const res = await uploadWithProgress(
          { title, type: g.type, fileName: file.name, mimeType: file.type || null, dataBase64: btoa(bin), checksum },
          (pct) => patchQueue(item.id, { progress: pct }),
        );
        if (res.duplicate) { duplicates++; patchQueue(item.id, { status: 'duplicate', progress: 100 }); }
        else { stored++; patchQueue(item.id, { status: 'stored', progress: 100 }); }
        setParsed({ name: file.name, label: g.label });
      } catch (err) {
        failed++;
        patchQueue(item.id, { status: 'error', error: err instanceof Error ? err.message : 'failed' });
      }
    }

    const parts = [`${stored} stored`];
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates > 1 ? 's' : ''} skipped`);
    if (failed) parts.push(`${failed} failed`);
    toast({
      title: `Batch finished: ${parts.join(' · ')}`,
      description: 'AES-256 encrypted · SHA-256 deduped · versioned · expiry alerts on.',
      variant: failed ? 'destructive' : undefined,
    });
    setBusyQueue(false);
    load();
  }

  async function onBrowsePicked(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) await enqueueFiles(e.target.files);
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

      {/* ── Drag & drop batch zone — drop MANY documents, each typed, hashed and stored ── */}
      <div
        role="button" tabIndex={0} aria-label="Drop documents to parse and upload"
        onClick={() => browseRef.current?.click()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && browseRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) enqueueFiles(e.dataTransfer.files);
        }}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-all outline-none',
          dragOver ? 'border-teal-500 bg-teal-500/5 scale-[1.01]' : 'border-slate-300 dark:border-slate-600 hover:border-teal-500/60 hover:bg-muted/30',
          busyQueue && 'pointer-events-none opacity-70',
        )}
      >
        <input ref={browseRef} type="file" multiple className="hidden" onChange={onBrowsePicked} aria-hidden="true" />
        <UploadCloud className={cn('h-9 w-9 mx-auto mb-2', dragOver ? 'text-teal-600' : 'text-slate-400')} />
        {busyQueue ? (
          <p className="text-sm font-semibold flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Uploading batch…
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Files className="inline h-4 w-4 mr-1 text-teal-600" /> Drop invoices, B/Ls, packing lists, permits — all at once
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse (multi-select) · type auto-detected per file · SHA-256 dedupe · real progress · encrypted AES-256 on write
            </p>
          </>
        )}
        {parsed && !busyQueue && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> {parsed.name} → detected: {parsed.label}
          </p>
        )}
      </div>

      {queue.length > 0 && (
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload queue — {queue.length} file(s)</p>
            {!busyQueue && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setQueue([])}>Clear</Button>}
          </div>
          {queue.map(item => (
            <div key={item.id} className="flex items-center gap-3 text-sm">
              {item.status === 'stored' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
              {item.status === 'duplicate' && <Copy className="h-4 w-4 text-amber-600 shrink-0" />}
              {item.status === 'error' && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
              {(item.status === 'hashing' || item.status === 'uploading') && <Loader2 className="h-4 w-4 animate-spin text-teal-600 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {item.status === 'hashing' && 'hashing SHA-256…'}
                    {item.status === 'uploading' && `${item.progress}%`}
                    {item.status === 'stored' && 'stored'}
                    {item.status === 'duplicate' && 'already in vault — skipped'}
                    {item.status === 'error' && item.error}
                  </span>
                </div>
                {item.status === 'uploading' && (
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-teal-600 transition-all" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
                        <p className="text-xs text-muted-foreground">{DOC_TYPES.find(t => t.k === d.type)?.label ?? d.type} · v{d.version} · {(d.fileSize / 1024).toFixed(0)} KB{d.checksum ? ` · #${d.checksum.slice(0, 8)}` : ''}</p>
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
      let checksum: string | undefined;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
        checksum = (await sha256Hex(file)) || undefined;
        const buf = await file.arrayBuffer();
        let bin = ''; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        dataBase64 = btoa(bin);
      }
      await api('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ ...f, fileName: file?.name || `${f.title || 'document'}.txt`, mimeType: file?.type || null, dataBase64, checksum }),
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
        const checksum = (await sha256Hex(file)) || undefined;
        const res = await api<{ duplicate?: boolean; document?: Doc }>('/api/documents', {
          method: 'POST',
          body: JSON.stringify({ title: doc.title, type: doc.type, expiryDate: doc.expiryDate, replaceGroupKey: doc.groupKey, fileName: file.name, mimeType: file.type, dataBase64: btoa(bin), checksum }),
        });
        if (res.duplicate) {
          toast({ title: 'Identical bytes to the current version', description: 'Replace skipped — the vault already stores this exact file.' });
        } else {
          toast({ title: 'New version created', description: `v${doc.version + 1} is now current.` });
        }
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
