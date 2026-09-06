'use client';

import { useEffect, useRef } from 'react';
import { playSound, vibrate } from '@/lib/sounds';

interface Notif {
  id: string; type: string; severity: string; title: string; body: string; readAt: string | null; createdAt: string;
}

/**
 * SoundAlerts — mounted in the dashboard layout.
 * Polls unseen notifications; on NEW critical (demurrage) plays the alarm and
 * vibrates; on new approval/message plays the matching tone. Sets the app
 * badge (Android/desktop) with the unread count. Poll stops when tab hidden.
 */
export function SoundAlerts() {
  const seenIds = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch('/api/notifications', { credentials: 'same-origin' });
        if (!res.ok) return;
        const json = await res.json();
        const items: Notif[] = json?.data?.notifications ?? json?.data ?? [];
        if (!Array.isArray(items)) return;

        const unseen = items.filter((n) => !n.readAt);
        // Badge with unread count (supported on installed PWA / desktop)
        try {
          navigator.setAppBadge?.(unseen.length).catch?.(() => null);
          if (unseen.length === 0) navigator.clearAppBadge?.();
        } catch { /* unsupported */ }

        const fresh = unseen.filter((n) => !seenIds.current.has(n.id));
        if (!firstRun.current) {
          for (const n of fresh) {
            if (n.severity === 'critical' || n.type === 'demurrage_24' || n.type === 'demurrage_48') {
              playSound('alarm', { critical: true });
              vibrate([200, 100, 200]);
              break;
            }
          }
          if (!fresh.some((n) => n.severity === 'critical')) {
            const nonCritical = fresh.find((n) => n.type === 'quote_approved' || n.type === 'eta');
            if (nonCritical) {
              playSound(nonCritical.type === 'eta' ? 'arrival' : 'approval');
              vibrate(60);
            } else if (fresh.length > 0) {
              playSound('message');
            }
          }
        }
        for (const n of unseen) seenIds.current.add(n.id);
        firstRun.current = false;
      } catch { /* offline: silent — SW serves cached reads */ }
    }

    void check();
    const t = setInterval(check, 30000);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return null;
}
