/**
 * CaribClear — In-memory rate limiter (Edge/serverless friendly).
 * IP-level first line of defense; account-level lockout lives in UserSecurity.
 */
const rateMap = new Map<string, { count: number; resetAt: number }>();

export interface RateResult { limited: boolean; remaining: number; retryAfter: number }

export function checkRate(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: max - 1, retryAfter: 0 };
  }
  entry.count++;
  if (entry.count > max) {
    return { limited: true, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { limited: false, remaining: max - entry.count, retryAfter: 0 };
}

export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
