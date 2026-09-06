'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Users, UserPlus, Copy, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Client {
  id: string; name: string; email: string | null; phone: string | null; company: string | null;
  trinNumber: string | null; users: { id: string; email: string; isActive: boolean }[];
  shipments: { id: string; reference: string; status: string }[];
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ clients: Client[] }>('/api/clients').catch(() => ({ clients: [] }));
    setClients(data.clients);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Importer clients</h1>
          <p className="text-sm text-muted-foreground">Your customers — each with optional one-click portal access.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreds(null); }}>
          <DialogTrigger asChild><Button className="bg-teal-600 hover:bg-teal-700"><UserPlus className="h-4 w-4 mr-1" /> New client</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            {creds ? (
              <div className="space-y-4 text-center">
                <DialogHeader><DialogTitle className="mx-auto">Portal access created 🎉</DialogTitle></DialogHeader>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1.5">
                  <p className="text-muted-foreground">Share these credentials with the client:</p>
                  <p className="font-mono font-semibold break-all">{creds.email}</p>
                  <p className="font-mono font-semibold text-lg text-teal-600">{creds.tempPassword}</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard?.writeText(`${creds.email} / ${creds.tempPassword}`); toast({ title: 'Copied' }); }}>
                  <Copy className="h-4 w-4 mr-1" /> Copy credentials
                </Button>
                <Button className="w-full bg-teal-600 hover:bg-teal-700" onClick={() => { setOpen(false); setCreds(null); }}>Done</Button>
              </div>
            ) : (
              <CreateForm onCreated={(c) => { setCreds(c); load(); }} />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clients.map(c => (
          <Card key={c.id}>
            <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{c.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{c.company ?? c.email ?? '—'}</p>
              </div>
              {c.users.length > 0 ? <Badge className="bg-teal-600 text-white border-0 text-[10px]">portal</Badge> : <Badge variant="secondary" className="text-[10px]">offline</Badge>}
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              {c.phone && <p className="text-muted-foreground">📞 {c.phone}</p>}
              {c.trinNumber && <p className="text-muted-foreground font-mono text-xs">TRIN: {c.trinNumber}</p>}
              <p className="flex items-center gap-1.5 text-muted-foreground"><Package className="h-3.5 w-3.5" /> {c.shipments.length} shipment(s)</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {c.shipments.slice(0, 3).map(s => <Badge key={s.id} variant="outline" className="text-[10px]">{s.reference}</Badge>)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {clients.length === 0 && (
        <Card><CardContent className="text-center py-14 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          No clients yet. Create one and give them portal access — they approve quotes with one click.
        </CardContent></Card>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (c: { email: string; tempPassword: string }) => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', trinNumber: '', createPortalAccess: true });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ portalCredentials: { email: string; tempPassword: string } | null }>('/api/clients', { method: 'POST', body: JSON.stringify(f) });
      if (data.portalCredentials) onCreated(data.portalCredentials);
      else { toast({ title: 'Client created (no portal access)' }); onCreated({ email: '—', tempPassword: '—' }); }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <DialogHeader><DialogTitle>New importer client</DialogTitle></DialogHeader>
      <div className="space-y-1.5"><Label htmlFor="cl-name">Name *</Label><Input id="cl-name" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="Sanchez Home & Auto" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="cl-email">Email</Label><Input id="cl-email" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="orders@client.tt" /></div>
        <div className="space-y-1.5"><Label htmlFor="cl-phone">Phone</Label><Input id="cl-phone" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+1-868-…" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="cl-co">Company</Label><Input id="cl-co" value={f.company} onChange={e => set('company', e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="cl-trin">TRIN</Label><Input id="cl-trin" value={f.trinNumber} onChange={e => set('trinNumber', e.target.value)} placeholder="TRN-000-000-000" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={f.createPortalAccess} onChange={e => set('createPortalAccess', e.target.checked)} />
        Create portal access (importer sees only their own data)
      </label>
      <DialogFooter><Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
        {busy && <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}Create client
      </Button></DialogFooter>
    </form>
  );
}
