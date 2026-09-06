'use client';

import { useEffect } from 'react';
import { installOutboxListeners } from '@/lib/offline/outbox';

/**
 * Mounts once in the root layout:
 * - registers the service worker (production always; dev via localStorage flag)
 * - installs outbox listeners (flush on reconnect)
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    installOutboxListeners();

    const devFlag = localStorage.getItem('cc-sw-dev') === '1';
    if (process.env.NODE_ENV !== 'production' && !devFlag) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        reg.active?.postMessage({ type: 'WAKE' });
      })
      .catch(() => null);
  }, []);

  return null;
}
