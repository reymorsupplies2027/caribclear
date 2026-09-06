'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe2, Loader2 } from 'lucide-react';
import { api } from '@/lib/client';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '', companyType: 'customs_broker' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
      window.location.href = '/dashboard'; // full-page nav for cookie availability
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gradient-to-b from-teal-600/10 to-transparent">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto h-11 w-11 rounded-xl bg-teal-600 grid place-items-center mb-2">
            <Globe2 className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Register your company</CardTitle>
          <CardDescription>Free plan: 1 user · 3 active shipments · basic vault</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" required value={form.companyName} onChange={set('companyName')} placeholder="Caribbean Freight & Trade Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyType">Your role</Label>
              <select id="companyType" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.companyType} onChange={set('companyType')}>
                <option value="customs_broker">Customs broker</option>
                <option value="freight_forwarder">Freight forwarder</option>
                <option value="importer">Importer (pyme)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" required value={form.name} onChange={set('name')} placeholder="Alicia Ramkissoon" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={form.email} onChange={set('email')} placeholder="you@company.tt" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password (min 8 chars)</Label>
              <Input id="password" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create tenant & start
            </Button>
          </form>
          <p className="mt-4 text-sm text-center text-muted-foreground">
            Already registered? <Link href="/login" className="text-teal-600 font-medium hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
