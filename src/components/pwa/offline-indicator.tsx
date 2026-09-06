'use client';

import { useEffect, useState, useCallback } from 'react';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { countOps, flushOps } from '@/lib/offline/outbox';

/**
 * Offline banner: appears when the device is offline or the outbox has
 * pending changes. Shows pending count + manual retry. The money-clock
 * app must never silently lose an approval.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await countOps());
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    const on = () => { setOnline(true); setTimeout(() => void flushOps().then(() => refresh()), 800); };
    const off = () => setOnline(false);
    const changed = () => void refresh();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('cc-outbox-changed', changed);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('cc-outbox-changed', changed);
    };
  }, [refresh]);

  async function retry() {
    setBusy(true);
    await flushOps();
    await refresh();
    setBusy(false);
  }

  if (online && pending === 0) return null;
  if (dismissed && online) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-slate-900 px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-2"
      role="status" aria-live="polite">
      {!online && <WifiOff className="h-3.5 w-3.5" aria-hidden />}
      {online
        ? `Syncing ${pending} pending change${pending === 1 ? '' : 's'}…`
        : pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} saved on device, will sync automatically`
          : 'Offline — viewing saved data'}
      {online && pending > 0 && (
        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-slate-900" onClick={retry} disabled={busy} aria-label="Retry sync now">
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
        </Button>
      )}
      {online && (
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="ml-1">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
