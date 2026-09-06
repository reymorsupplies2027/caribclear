/**
 * CaribClear proxy — security headers + session cookie guard.
 * JWT verification stays in route handlers (session.ts) to avoid
 * Edge/runtime key mismatch issues (tt-whistleblower lesson).
 */
import { NextRequest, NextResponse } from 'next/server';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsSession = pathname.startsWith('/dashboard') || pathname.startsWith('/portal') || pathname.startsWith('/admin');
  const isApi = pathname.startsWith('/api/');
  const isPublicApi = ['/api/auth/', '/api/portal/', '/api/health', '/api/demo/'].some(p => pathname.startsWith(p));

  // Dashboard/portal/admin pages: quick cookie guard (JWT verified in handlers)
  if (needsSession) {
    const token = req.cookies.get('cc-session')?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url, 302);
    }
    if (req.headers.get('x-forwarded-proto') === 'http' && process.env.NODE_ENV === 'production') {
      const https = req.nextUrl.clone();
      https.protocol = 'https:';
      return NextResponse.redirect(https, 301);
    }
  }

  const res = NextResponse.next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  if (!isApi || isPublicApi) res.headers.set('Content-Security-Policy', CSP);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
