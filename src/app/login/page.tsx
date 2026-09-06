'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe2, Loader2 } from 'lucide-react';
import { api, ROLE_HOME } from '@/lib/client';

function LoginForm() {
  const params = useSearchParams();
  const demo = params.get('demo');
  const [email, setEmail] = useState(demo ? 'admin@caribbeanfreight.demo' : '');
  const [password, setPassword] = useState(demo ? 'Demo2026!' : '');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api<{ user: { role: string }; twoFactorRequired?: boolean }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password, totp: totp || undefined }),
      });
      if (data.twoFactorRequired) { setNeedTotp(true); setLoading(false); return; }
      // Full-page nav so the fresh cookie is always used (tt-wb lesson)
      window.location.href = ROLE_HOME[data.user.role] ?? '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gradient-to-b from-teal-600/10 to-transparent">
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
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
