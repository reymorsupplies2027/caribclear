'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Building2, MapPin, KeyRound, ArrowRight, ArrowLeft } from 'lucide-react';

const REGIONS = ['Trinidad', 'Tobago', 'Jamaica', 'Barbados', 'Guyana', 'CARICOM'];

export default function NewTenantWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ adminEmail: string; tempPassword: string; tenantName: string } | null>(null);
  const [copied, setCopied] = useState<'pw' | 'email' | null>(null);

  // Step 1 — Company
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // Step 2 — Location & plan
  const [region, setRegion] = useState('Trinidad');
  const [city, setCity] = useState('');
  const [plan, setPlan] = useState('free');
  const [notes, setNotes] = useState('');
  // Step 3 — Admin account
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const step1Valid = name.trim().length >= 3;
  const step2Valid = region.length > 0;
  const step3Valid = adminName.trim().length >= 3 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail);

  async function create() {
    setBusy(true);
    try {
      const res = await api<{ tenant: { name: string }; credentials: { adminEmail: string; tempPassword: string } }>('/api/tower/tenants', {
        method: 'POST',
        body: JSON.stringify({ name, region, city, plan, contactEmail, adminName, adminEmail, notes }),
      });
      setDone({ adminEmail: res.credentials.adminEmail, tempPassword: res.credentials.tempPassword, tenantName: res.tenant.name });
      toast({ title: 'Tenant onboarded', description: `${res.tenant.name} now has an office in the building.` });
    } catch (err) {
      toast({ title: 'Could not create tenant', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  function copy(v: string, which: 'pw' | 'email') {
    navigator.clipboard.writeText(v).then(() => { setCopied(which); setTimeout(() => setCopied(null), 1500); });
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="border-emerald-500/40">
          <CardContent className="p-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-600/10 grid place-items-center mx-auto">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold">{done.tenantName} is in the building</h1>
              <p className="text-sm text-muted-foreground mt-1">Hand these credentials to the new broker admin. They must change the password on first login.</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-left space-y-2">
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm">{done.adminEmail}</code>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copy(done.adminEmail, 'email')} aria-label="Copy email">
                  {copied === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-bold">{done.tempPassword}</code>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copy(done.tempPassword, 'pw')} aria-label="Copy password">
                  {copied === 'pw' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => router.push('/tower/tenants')}>Back to book</Button>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => { setDone(null); setStep(1); setName(''); setContactEmail(''); setCity(''); setNotes(''); setAdminName(''); setAdminEmail(''); }}>
                Onboard another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Onboard a new tenant</h1>
        <p className="text-sm text-muted-foreground">Three steps to open a new office in the building.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map(n => (
          <div key={n} className="flex-1">
            <div className={`h-1.5 rounded-full ${n <= step ? 'bg-violet-600' : 'bg-muted'}`} />
            <p className={`text-[10px] mt-1 ${n === step ? 'font-bold text-violet-600' : 'text-muted-foreground'}`}>
              {['Company', 'Location & plan', 'Admin account'][n - 1]}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-violet-600" />Company identity</div>
              <div className="space-y-1.5">
                <Label htmlFor="w-name">Company name *</Label>
                <Input id="w-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Port of Spain Clearing Ltd" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-contact">Billing contact email (optional)</Label>
                <Input id="w-contact" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="accounts@company.com" />
              </div>
              <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" disabled={!step1Valid}
                onClick={() => setStep(2)}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-violet-600" />Where are they & what do they rent?</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Region *</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger aria-label="Region"><SelectValue /></SelectTrigger>
                    <SelectContent>{REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-city">City</Label>
                  <Input id="w-city" value={city} onChange={e => setCity(e.target.value)} placeholder="Kingston" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger aria-label="Plan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free — 1 user, 3 active shipments, basic vault (14-day trial flag)</SelectItem>
                    <SelectItem value="pro">Pro — US$149/mo, full building access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-notes">Private notes (optional)</Label>
                <Textarea id="w-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Referred by…, negotiated price…" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
                <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={!step2Valid} onClick={() => setStep(3)}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-violet-600" />Broker admin account</div>
              <div className="space-y-1.5">
                <Label htmlFor="w-aname">Admin full name *</Label>
                <Input id="w-aname" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Alicia Ramkissoon" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-aemail">Admin email (login) *</Label>
                <Input id="w-aemail" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@company.com" />
              </div>
              <p className="text-xs text-muted-foreground">A strong temporary password is generated automatically and shown once after creation.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
                <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" disabled={!step3Valid || busy} onClick={create}>
                  {busy ? 'Creating…' : 'Create tenant'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
