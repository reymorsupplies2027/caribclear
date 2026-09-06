'use client';

/**
 * CaribClear Outbox — offline mutation queue (IndexedDB).
 * Pattern: optimistic enqueue when the network fails, automatic flush on
 * reconnect (window 'online' event + SW background sync + manual retry).
 * Server stays canonical; each op carries the exact request it would have made.
 */

const DB_NAME = 'cc-outbox';
const STORE = 'queue';

interface OutboxOp {
  id: string;
  url: string;
  method: string;
  body: string;
  createdAt: number;
  label: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function enqueueOp(op: Omit<OutboxOp, 'id' | 'createdAt'>): Promise<void> {
  const store = await tx('readwrite');
  const full: OutboxOp = { ...op, id: crypto.randomUUID(), createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const r = store.add(full);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  window.dispatchEvent(new CustomEvent('cc-outbox-changed'));
}

export async function getOps(): Promise<OutboxOp[]> {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve((r.result as OutboxOp[]).sort((a, b) => a.createdAt - b.createdAt));
    r.onerror = () => reject(r.error);
  });
}

export async function countOps(): Promise<number> {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const r = store.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function deleteOp(id: string): Promise<void> {
  const store = await tx('readwrite');
  await new Promise<void>((resolve) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
  });
}

let flushing = false;

/** Replay queued ops in order. Stops on first network failure (keeps order). */
export async function flushOps(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return { flushed: 0, remaining: await countOps() };
  flushing = true;
  let flushed = 0;
  try {
    const ops = await getOps();
    for (const op of ops) {
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: op.body || undefined,
        });
        if (res.ok) {
          await deleteOp(op.id);
          flushed += 1;
        } else if (res.status >= 400 && res.status < 500) {
          await deleteOp(op.id); // invalid now (e.g. already approved) — drop
        } else {
          break; // server error — retry later
        }
      } catch {
        break; // network still down
      }
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new CustomEvent('cc-outbox-changed'));
  }
  return { flushed, remaining: await countOps() };
}

/** True when the request failed due to being offline (vs a real API error). */
export function isOfflineFailure(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    e?.message === 'Failed to fetch' ||
    e?.message === 'Load failed' ||
    e?.message === 'NetworkError when attempting to fetch resource.'
  );
}

/** Install global listeners once (idempotent). */
export function installOutboxListeners() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __ccOutboxInstalled?: boolean };
  if (w.__ccOutboxInstalled) return;
  w.__ccOutboxInstalled = true;

  window.addEventListener('online', () => { void flushOps(); });
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'FLUSH_OUTBOX') void flushOps();
  });
  void flushOps(); // opportunistic flush on load
}
