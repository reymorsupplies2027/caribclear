'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Landmark, Plus, History, ArrowRight } from 'lucide-react';

interface RateVersion {
  id: string; key: string; value: string; version: number;
  effectiveFrom: string; isActive: boolean; notes: string | null; createdAt: string;
}
interface RateKey { key: string; active: RateVersion | null; history: RateVersion[]; }
interface DiffLine { path: string; old: unknown; new: unknown; }

export default function RateCommandPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<RateKey[] | null>(null);
  const [error, setError] = useState('');

  // Publish dialog state
  const [open, setOpen] = useState(false);
  const [editKey, setEditKey] = useState('engine_snapshot');
  const [editValue, setEditValue] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [jsonError, setJsonError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: RateKey[] }>('/api/tower/rates');
      setKeys(data.keys); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load rate tables.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openPublish(key: RateKey) {
    setEditKey(key.key);
    setEditValue(key.active ? JSON.stringify(JSON.parse(key.active.value), null, 2) : '{\n  \n}');
    setNotes('');
    setDiff(null);
    setJsonError('');
    setOpen(true);
  }

  function computeDiff() {
    setJsonError(''); setDiff(null);
    let parsed: unknown;
    try { parsed = JSON.parse(editValue); } catch {
      setJsonError('Invalid JSON — fix the syntax before publishing.');
      return;
    }
    const current = keys?.find(k => k.key === editKey)?.active;
    const oldVal = current ? JSON.parse(current.value) : null;
    // Client-side mirror of the server diff (server recomputes authoritatively)
    const lines: DiffLine[] = [];
    const walk = (a: unknown, b: unknown, path: string) => {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const ks = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
        for (const k of ks) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      } else lines.push({ path: path || 'value', old: a, new: b });
    };
    walk(oldVal, parsed, '');
    setDiff(lines);
  }

  async function publish() {
    setBusy(true);
    try {
      const res = await api<{ version: number; diff: DiffLine[]; notifiedTenants: number }>('/api/tower/rates', {
        method: 'POST',
        body: JSON.stringify({ key: editKey, value: editValue, effectiveFrom, notes }),
      });
      toast({
        title: `Published v${res.version} — ${res.diff.length} line(s) changed`,
        description: `${res.notifiedTenants} tenant(s) notified in their alert center.`,
      });
      setOpen(false);
      await load();
    } catch (err) {
      toast({ title: 'Publish failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2"><Landmark className="h-5 w-5 text-violet-600" />Rate command</h1>
        <p className="text-sm text-muted-foreground">
          Versioned tax tables with legal effective dates. Publish here — every tenant is notified with the exact diff. Nothing is ever hardcoded.
        </p>
      </div>

      {error && <Card><CardContent className="p-6 text-center text-sm text-rose-600">{error}</CardContent></Card>}
      {!keys && !error && <p className="text-sm text-muted-foreground animate-pulse">Loading rate tables…</p>}

      {keys && keys.map(k => (
        <Card key={k.key}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-mono">{k.key}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{k.active?.version ?? '—'}</Badge>
                {k.active && <Badge className="bg-emerald-600 text-white border-0">active</Badge>}
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openPublish(k)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Publish new version
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {k.active && (
              <div className="text-xs text-muted-foreground">
                Effective from <span className="font-semibold text-foreground">{new Date(k.active.effectiveFrom).toISOString().slice(0, 10)}</span>
                {k.active.notes ? <> · {k.active.notes}</> : null}
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                <History className="h-3.5 w-3.5" />Version history ({k.history.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {k.history.map(h => (
                  <li key={h.id} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">v{h.version}</Badge>
                    <span className="text-muted-foreground">{fmtDateTime(h.createdAt)}</span>
                    {h.isActive ? <Badge className="bg-emerald-600 text-white border-0 text-[10px]">active</Badge> : <Badge variant="secondary" className="text-[10px]">superseded</Badge>}
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      ))}

      {/* Publish dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">Publish new version — {editKey}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rc-eff">Effective from</Label>
                <Input id="rc-eff" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rc-notes">Notes (public)</Label>
                <Input id="rc-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ministry of Finance 2026 revision" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rc-value">Rate table JSON</Label>
              <Textarea id="rc-value" rows={12} value={editValue} onChange={e => { setEditValue(e.target.value); setDiff(null); }} className="font-mono text-xs" spellCheck={false} />
              {jsonError && <p className="text-xs text-rose-600">{jsonError}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={computeDiff}>Compute diff <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>

            {diff !== null && (
              <div className="rounded-lg border p-3 space-y-1.5 max-h-52 overflow-y-auto">
                <p className="text-xs font-semibold">{diff.length === 0 ? 'No changes — same table.' : `${diff.length} line(s) will change:`}</p>
                {diff.map((d, i) => (
                  <div key={i} className="text-xs font-mono grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <span className="truncate text-muted-foreground">{d.path}</span>
                    <span className="text-rose-600 line-through">{JSON.stringify(d.old)}</span>
                    <span className="text-emerald-600 font-bold">{JSON.stringify(d.new)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="bg-violet-600 hover:bg-violet-700 text-white" disabled={busy || diff === null || diff.length === 0 && false} onClick={publish}>
                {busy ? 'Publishing…' : `Publish v${(keys?.find(k => k.key === editKey)?.active?.version ?? 0) + 1}`}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Publishing supersedes the current version, records the diff in the immutable audit trail, and notifies every tenant&apos;s alert center with the changed lines.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
