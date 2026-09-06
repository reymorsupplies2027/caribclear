/** API response helpers — consistent envelope + guard error mapping. */
import { NextResponse } from 'next/server';
import { UnauthorizedError, ForbiddenError } from '@/lib/session';

export function ok(data: unknown, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function fail(status: number, code: string, message: string, extra?: Record<string, string>) {
  return NextResponse.json({ success: false, error: { code, message, ...extra } }, { status });
}

export function guardError(err: unknown) {
  if (err instanceof UnauthorizedError) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
  if (err instanceof ForbiddenError) return fail(403, 'FORBIDDEN', err.message || 'Access denied.');
  console.error('[api]', err instanceof Error ? err.message : err);
  return fail(500, 'INTERNAL', 'Unexpected error. Check server logs.');
}

export async function readJson<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
