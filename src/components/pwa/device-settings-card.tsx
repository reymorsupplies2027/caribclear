'use client';

import { useEffect, useState, useCallback } from 'react';
import { BellRing, BellOff, Volume2, VolumeX, Send, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/client';
import { soundsEnabled, setSoundsEnabled } from '@/lib/sounds';
import { installOutboxListeners } from '@/lib/offline/outbox';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Device & notifications card: Web Push (real VAPID), synthesized sounds toggle,
 * and app install — the phone-native layer of CaribClear.
 */
export function DeviceSettingsCard() {
  const [pushSupported, setPushSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [sounds, setSounds] = useState(true);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);

  const checkSub = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPushSupported(supported);
    if (supported) setPermission(Notification.permission);
    setSounds(soundsEnabled());
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    installOutboxListeners();
    void checkSub();
  }, [checkSub]);

  async function enablePush() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast({ title: 'Permission not granted', description: 'Enable notifications for this site in your browser settings.', variant: 'destructive' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        ...(vapidKey ? { applicationServerKey: urlBase64ToUint8Array(vapidKey) as Uint8Array<ArrayBuffer> } : {}),
      });
      const json = sub.toJSON();
      await api('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys ?? {} }),
      });
      setSubscribed(true);
      toast({ title: 'Notifications enabled', description: 'Demurrage alarms, arrivals and approvals will reach this device.' });
    } catch (err) {
      toast({ title: 'Could not enable push', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function testPush() {
    setBusy(true);
    try {
      const res = await api<{ sent: number }>('/api/push/test', { method: 'POST' });
      toast({ title: `Test push sent to ${res.sent} device(s)`, description: 'Check your notifications.' });
    } catch (err) {
      toast({ title: 'Test failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2"><Smartphone className="h-5 w-5 text-teal-600" />Device & notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              {subscribed ? <BellRing className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
              Push notifications
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pushSupported
                ? subscribed
                  ? 'Enabled on this device — demurrage alarms included.'
                  : permission === 'denied'
                    ? 'Blocked by the browser. Enable site notifications in settings.'
                    : 'Demurrage alarms, arrivals and approval requests straight to this device.'
                : 'Not supported in this browser — install the app on your phone for push.'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-1.5">
            {pushSupported && !subscribed && permission !== 'denied' && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={enablePush} disabled={busy}>Enable</Button>
            )}
            {pushSupported && subscribed && (
              <Button size="sm" variant="outline" onClick={testPush} disabled={busy}><Send className="h-3.5 w-3.5 mr-1" />Send test</Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              {sounds ? <Volume2 className="h-4 w-4 text-emerald-600" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              Alert sounds
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Synthesized signals: arrival ding, approval bell, demurrage alarm. Quiet hours 11 PM – 7 AM (critical alarms still sound).
            </p>
          </div>
          <Button size="sm" variant={sounds ? 'outline' : 'secondary'} className="shrink-0"
            onClick={() => { const v = !sounds; setSounds(v); setSoundsEnabled(v); toast({ title: v ? 'Sounds on' : 'Sounds off' }); }}>
            {sounds ? 'On' : 'Off'}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4 text-teal-600" />Install the app</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {installed ? 'Running as an installed app — full offline mode active.' : 'Use your browser menu → “Install app” / “Add to Home Screen” for offline access, app icon and full-screen mode.'}
            </p>
          </div>
          {installed && <span className="text-xs font-semibold text-emerald-600 shrink-0">Installed</span>}
        </div>
      </CardContent>
    </Card>
  );
}
