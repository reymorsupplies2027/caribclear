'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtTTD } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Star, Trash2, Plus, History, Clock, Sparkles, ScanSearch } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface HsCode { id: string; code: string; description: string; chapter: string; unit: string | null; cetRate: number; vatExempt: boolean; notes: string | null }
interface Saved { id: string; name: string; hsCode: string; notes: string | null }
interface Recent { id: string; query: string; hsCode: string | null; createdAt: string }
interface ClassifyCandidate { code: string; description: string; cetRate: number; vatExempt: boolean; score: number; reason?: string; source: string }
interface ClassifyResponse { candidates: ClassifyCandidate[]; engine: string; tariffRows: number; disclaimer: string }

export default function HsCodesPage() {
  const [q, setQ] = useState('');
  const [codes, setCodes] = useState<HsCode[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: '', hsCode: '' });
  const [aiDesc, setAiDesc] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<ClassifyResponse | null>(null);

  const load = useCallback(async (query?: string) => {
    const data = await api<{ codes: HsCode[]; saved: Saved[]; recent: Recent[] }>(`/api/hs?q=${encodeURIComponent(query || '')}`).catch(() => ({ codes: [], saved: [], recent: [] }));
    setCodes(data.codes); setSaved(data.saved); setRecent(data.recent);
  }, []);

  useEffect(() => { load(); }, [load]);

  const search = useCallback(() => load(q), [q, load]);

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/hs', { method: 'POST', body: JSON.stringify(saveForm) });
      toast({ title: 'Rate saved', description: `${saveForm.name} → ${saveForm.hsCode}` });
      setSaveOpen(false); setSaveForm({ name: '', hsCode: '' });
      load(q);
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }); }
  }

  async function removeSaved(id: string) {
    await api(`/api/hs?id=${id}`, { method: 'DELETE' }).catch(() => null);
    load(q);
  }

  async function classify() {
    if (aiDesc.trim().length < 3) {
      toast({ title: 'Describe the product first', variant: 'destructive' });
      return;
    }
    setAiBusy(true);
    try {
      const data = await api<ClassifyResponse>('/api/hs/classify', { method: 'POST', body: JSON.stringify({ description: aiDesc }) });
      setAiResult(data);
      if (data.candidates.length === 0) toast({ title: 'No fit found', description: 'Nothing in the tariff table matches — add the code or rephrase.' });
    } catch (err) {
      toast({ title: 'Classification failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setAiBusy(false); }
  }

  return (
    <div className="grid gap-5 max-w-7xl mx-auto lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">HS / CET tariff search</h1>
          <p className="text-sm text-muted-foreground">Caribbean Common External Tariff bands + T&T national deviations. Admin-editable, versioned.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Code, description or chapter — try 8703, tyre, food…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          </div>
          <Button onClick={search} className="bg-teal-600 hover:bg-teal-700">Search</Button>
        </div>

        {/* ── AI classifier — grounded: candidates only from the real tariff table ── */}
        <Card className="border-teal-600/30 bg-teal-600/[0.04]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <p className="text-sm font-semibold">AI classification — describe the product, get the HS code + taxes</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. stainless steel kitchen sinks / used Toyota Axio 1496cc hybrid / frozen chicken wings"
                value={aiDesc} onChange={e => setAiDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !aiBusy && classify()}
              />
              <Button onClick={classify} disabled={aiBusy} variant="outline" className="border-teal-600/50 text-teal-700 dark:text-teal-400 shrink-0">
                {aiBusy ? <span className="h-4 w-4 rounded-full border-2 border-teal-600 border-t-transparent animate-spin inline-block" />
                  : <ScanSearch className="h-4 w-4 mr-1" />} Classify
              </Button>
            </div>
            {aiResult && (
              <div className="space-y-2">
                {aiResult.candidates.map((c, i) => (
                  <div key={c.code} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`font-mono border-0 ${i === 0 ? 'bg-teal-600 text-white' : 'bg-muted text-foreground'}`}>{c.code}</Badge>
                        <span className="text-xs font-semibold">CET {c.cetRate}%</span>
                        <span className="text-xs text-muted-foreground">· {c.vatExempt ? 'VAT exempt' : 'VAT 12.5%'}</span>
                        <Badge variant="outline" className="text-[10px]">{c.score}% {c.source === 'llm' ? 'AI' : 'lexical'}</Badge>
                      </div>
                      <p className="text-xs mt-1 truncate">{c.description}</p>
                      {c.reason && <p className="text-[11px] text-muted-foreground mt-0.5">{c.reason}</p>}
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs"
                      onClick={() => { setQ(c.code); load(c.code); }}>
                      View
                    </Button>
                  </div>
                ))}
                {aiResult.candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">No candidate fits. Add the tariff line or rephrase the description.</p>
                )}
                <p className="text-[11px] text-muted-foreground">{aiResult.disclaimer} · engine: {aiResult.engine}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-2">
          {codes.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-mono">{c.code}</Badge>
                    <span className="text-sm font-semibold">CET {c.cetRate}%</span>
                    {c.vatExempt ? <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">VAT exempt</Badge>
                      : <Badge variant="outline">VAT 12.5%</Badge>}
                    {c.unit && <Badge variant="outline" className="text-[10px]">per {c.unit}</Badge>}
                  </div>
                  <p className="text-sm mt-1">{c.description}</p>
                  {c.notes && <p className="text-xs text-muted-foreground mt-1">💡 {c.notes}</p>}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Save rate for ${c.code}`}
                  onClick={() => { setSaveForm({ name: c.description.slice(0, 40), hsCode: c.code }); setSaveOpen(true); }}>
                  <Star className="h-4 w-4 text-amber-500" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {codes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No matches — try another term.</p>}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Saved rates</CardTitle>
            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild><Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button></DialogTrigger>
              <DialogContent className="max-w-sm">
                <form onSubmit={saveProduct} className="space-y-4">
                  <DialogHeader><DialogTitle>Save product rate</DialogTitle></DialogHeader>
                  <div className="space-y-1.5"><Label htmlFor="p-name">Product name</Label>
                    <Input id="p-name" required value={saveForm.name} onChange={e => setSaveForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-hs">HS code</Label>
                    <Input id="p-hs" required value={saveForm.hsCode} onChange={e => setSaveForm(f => ({ ...f, hsCode: e.target.value }))} /></div>
                  <DialogFooter><Button type="submit" className="bg-teal-600 hover:bg-teal-700">Save</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-2">
            {saved.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0">
                <div className="min-w-0"><p className="font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground font-mono">{s.hsCode}</p></div>
                <Button variant="ghost" size="icon" onClick={() => removeSaved(s.id)} aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
              </div>
            ))}
            {saved.length === 0 && <p className="text-sm text-muted-foreground">Star a tariff line to keep your go-to rates one tap away.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-teal-600" /> Recent searches</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recent.map(r => (
              <button key={r.id} className="flex w-full items-center justify-between text-sm hover:bg-muted/50 rounded px-1 py-1"
                onClick={() => { setQ(r.query); load(r.query); }}>
                <span className="flex items-center gap-2 min-w-0"><Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate">{r.query}</span></span>
                <span className="font-mono text-xs text-muted-foreground">{r.hsCode ?? '—'}</span>
              </button>
            ))}
            {recent.length === 0 && <p className="text-sm text-muted-foreground">Search history appears here.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
