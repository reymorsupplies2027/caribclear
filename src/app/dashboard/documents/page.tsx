'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDate, fmtDateTime, daysUntil } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { FolderLock, Upload, AlertTriangle, Replace, Trash2, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

  const load = useCallback(async () => {
    const data = await api<{ documents: Doc[] }>(`/api/documents?type=${type}`).catch(() => ({ documents: [] }));
    setDocs(data.documents); setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const expiring = docs.filter(d => d.expiryDate && (daysUntil(d.expiryDate) ?? 99) < 30);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Document vault</h1>
          <p className="text-sm text-muted-foreground">5-year retention (Customs Act Cap 78:01) · versioning · expiry alerts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700"><Upload className="h-4 w-4 mr-1" /> Upload document</Button></DialogTrigger>
          <DialogContent className="max-w-lg"><UploadForm onDone={() => { setOpen(false); load(); }} /></DialogContent>
        </Dialog>
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
                      <ReplaceDoc doc={d} onDone={load} />
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
