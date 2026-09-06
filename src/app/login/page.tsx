'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe2, Loader2, KeyRound, ShieldCheck, Package, TowerControl } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { api, ROLE_HOME } from '@/lib/client';

/* Saved keys — one-click access for the demo tenant (public demo data) */
const DEMO_KEYS = [
  {
    label: 'Customs Broker — full dashboard', icon: ShieldCheck,
    email: 'admin@caribbeanfreight.demo', password: 'Demo2026!',
  },
  {
    label: 'Importer — client portal', icon: Package,
    email: 'importer@demo.tt', password: 'Demo2026!',
  },
  {
    label: 'Super Admin — Control Tower', icon: TowerControl,
    email: 'super@caribclear.dev', password: 'Super2026!',
  },
] as const;

function LoginForm() {
  const params = useSearchParams();
  const demo = params.get('demo');
  const [email, setEmail] = useState(demo ? 'admin@caribbeanfreight.demo' : '');
  const [password, setPassword] = useState(demo ? 'Demo2026!' : '');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function runLogin(em: string, pw: string) {
    setError(''); setLoading(true);
    try {
      const data = await api<{ user: { role: string }; twoFactorRequired?: boolean }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email: em, password: pw, totp: totp || undefined }),
      });
      if (data.twoFactorRequired) { setNeedTotp(true); setLoading(false); return; }
      // Full-page nav so the fresh cookie is always used (tt-wb lesson)
      window.location.href = ROLE_HOME[data.user.role] ?? '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await runLogin(email, password);
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gradient-to-b from-teal-600/10 to-transparent relative">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-11 w-11 rounded-xl bg-teal-600 grid place-items-center mb-2">
            <Globe2 className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Sign in to CaribClear</CardTitle>
          <CardDescription>Your trade operation, clear as Caribbean water</CardDescription>
        </CardHeader>
        <CardContent>
          {demo && (
            <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
              <strong>Demo mode:</strong> broker credentials pre-filled. Just press <em>Sign in</em>.
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.tt" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {needTotp && (
              <div className="space-y-1.5">
                <Label htmlFor="totp">2FA code (6 digits or backup code)</Label>
                <Input id="totp" inputMode="numeric" maxLength={12} value={totp} onChange={e => setTotp(e.target.value)} placeholder="123456" />
              </div>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Sign in
            </Button>
          </form>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            New company? <Link href="/register" className="text-teal-600 font-medium hover:underline">Create your tenant</Link>
          </p>

          {/* ── Quick access — saved keys, one click each ── */}
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              <KeyRound className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" /> Quick access — saved keys
            </p>
            <div className="space-y-2">
              {DEMO_KEYS.map((k) => (
                <button
                  key={k.email}
                  type="button"
                  disabled={loading}
                  onClick={() => { setEmail(k.email); setPassword(k.password); runLogin(k.email, k.password); }}
                  className="w-full flex items-center gap-3 rounded-lg bg-white dark:bg-card border border-slate-200 dark:border-white/10 px-3 py-2.5 text-left hover:border-teal-400/60 hover:shadow-sm transition-all disabled:opacity-50 group"
                >
                  <span className="h-8 w-8 rounded-lg bg-teal-500/10 grid place-items-center shrink-0">
                    <k.icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{k.label}</span>
                    <span className="block text-[10px] text-slate-400 truncate">{k.email} · {k.password}</span>
                  </span>
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Enter →</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">One click signs you in — no typing. Demo data only.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
