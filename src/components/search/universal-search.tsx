'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Ship, FolderLock, Users, Search, ReceiptText, Calculator, CornerDownLeft, Loader2, WifiOff, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * UniversalSearch — the operator's command palette (⌘K / Ctrl+K, or "/").
 * One box to find ANYTHING in the workspace: shipments, vault documents,
 * clients, HS/CET codes, quotes & invoices, cost calculations.
 *
 * - Debounced server search (/api/search) with grouped, ranked hits.
 * - Recent searches persisted locally (8 max).
 * - Offline: falls back to the last successful results with an honest badge.
 */

interface Hit {
  id: string;
  group: 'shipments' | 'documents' | 'clients' | 'hs' | 'quotes' | 'costs';
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
}

const GROUP_META: Record<Hit['group'], { label: string; icon: typeof Ship }> = {
  shipments: { label: 'Shipments', icon: Ship },
  documents: { label: 'Vault documents', icon: FolderLock },
  clients: { label: 'Clients', icon: Users },
  hs: { label: 'HS / CET codes', icon: Search },
  quotes: { label: 'Quotes & invoices', icon: ReceiptText },
  costs: { label: 'Cost calculations', icon: Calculator },
};
const GROUP_ORDER = ['shipments', 'documents', 'clients', 'hs', 'quotes', 'costs'] as const;

const RECENTS_KEY = 'cc-recent-searches';
const CACHE_KEY = 'cc-search-cache';

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}

function pushRecent(q: string) {
  const list = [q, ...loadRecents().filter((x) => x !== q)].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
}

export function UniversalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !open)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('cc-open-search', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cc-open-search', onOpenEvent);
    };
  }, [open]);

  const runSearch = useCallback(async (query: string) => {
    const mySeq = ++seq.current;
    if (query.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (mySeq !== seq.current) return;
      const data = json?.data ?? {};
      setHits(Array.isArray(data.hits) ? data.hits : []);
      setOffline(false);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ q: query, hits: data.hits || [] })); } catch { /* quota */ }
    } catch {
      if (mySeq !== seq.current) return;
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached?.hits?.length) { setHits(cached.hits); setOffline(true); }
        else setHits([]);
      } catch { setHits([]); }
      setOffline(!navigator.onLine);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, []);

  const onQueryChange = useCallback((v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(() => runSearch(v), 220);
  }, [runSearch]);

  const go = useCallback((h: Hit) => {
    pushRecent(q.trim());
    setRecents(loadRecents());
    setOpen(false);
    router.push(h.href);
  }, [q, router]);

  useEffect(() => { if (open) setRecents(loadRecents()); }, [open]);

  const groups = GROUP_ORDER
    .map((g) => ({ g, items: hits.filter((h) => h.group === g) }))
    .filter((x) => x.items.length > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:border-teal-500/50 transition-colors w-full"
        aria-label="Search everything"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search everything…</span>
        <kbd className="ml-auto hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-xl top-[15%] translate-y-0 overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">Universal search</DialogTitle>
          <Command shouldFilter={false} className="outline-none">
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={q}
                onValueChange={onQueryChange}
                autoFocus
                placeholder="Reference, client, document, HS code, invoice…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" />}
              {offline && <span className="flex items-center gap-1 text-[11px] rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 shrink-0"><WifiOff className="h-3 w-3" /> offline</span>}
            </div>
            <Command.List className="max-h-[55vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                {q.trim().length < 2 ? 'Type at least 2 characters — search runs across your whole workspace.' : 'No matches. Try a reference, name, or HS code fragment.'}
              </Command.Empty>

              {groups.map(({ g, items }) => {
                const Meta = GROUP_META[g];
                return (
                  <Command.Group key={g} heading={<span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{Meta.label}</span>}>
                    {items.map((h) => (
                      <Command.Item
                        key={h.id}
                        value={`${h.title} ${h.subtitle}`}
                        onSelect={() => go(h)}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer aria-selected:bg-teal-600/10 aria-selected:text-teal-800 dark:aria-selected:text-teal-300"
                      >
                        <div className="h-8 w-8 rounded-md bg-muted grid place-items-center shrink-0"><Meta.icon className="h-4 w-4 text-muted-foreground" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            {h.title}
                            {h.badge && <span className="text-[10px] uppercase rounded bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">{h.badge}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{h.subtitle}</div>
                        </div>
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 aria-selected:opacity-100" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {q.trim().length < 2 && recents.length > 0 && (
                <Command.Group heading={<span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent searches</span>}>
                  {recents.map((r) => (
                    <Command.Item key={r} value={`recent ${r}`} onSelect={() => onQueryChange(r)}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer text-sm aria-selected:bg-teal-600/10">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{r}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">esc</kbd> close</span>
              <span className="ml-auto">Shipments · Vault · Clients · HS · Quotes · Costs</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
