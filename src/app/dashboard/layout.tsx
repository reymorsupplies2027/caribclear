'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api, fmtDate } from '@/lib/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard, Ship, FolderLock, Calculator, Search, ClipboardCheck, Users, ReceiptText, Settings, Globe2, Bell, LogOut, Menu, X,
} from 'lucide-react';

interface Me {
  user: { name: string; email: string; role: string; tenantName: string | null };
  tenant: { plan: string; defaultExchangeRate: number; name: string } | null;
}
interface Notif { id: string; title: string; body: string; severity: string; readAt: string | null; createdAt: string }

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/shipments', label: 'Shipments', icon: Ship },
  { href: '/dashboard/documents', label: 'Vault', icon: FolderLock },
  { href: '/dashboard/calculator', label: 'Cost engine', icon: Calculator },
  { href: '/dashboard/hs-codes', label: 'HS / CET', icon: Search },
  { href: '/dashboard/permits', label: 'Permits', icon: ClipboardCheck },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/quotes', label: 'Quotes', icon: ReceiptText },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await api<{ notifications: Notif[]; unread: number }>('/api/notifications');
      setNotifs(data.notifications); setUnread(data.unread);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    api<Me>('/api/auth/me')
      .then((data) => {
        if (data.user.role === 'importer') { window.location.href = '/portal'; return; }
        if (data.user.role === 'super_admin') { window.location.href = '/admin'; return; }
        setMe(data);
      })
      .catch(() => { window.location.href = '/login'; });
    loadNotifs();
    const t = setInterval(loadNotifs, 30000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  async function markAll() {
    await api('/api/notifications', { method: 'PATCH', body: JSON.stringify({ all: true }) }).catch(() => null);
    loadNotifs();
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }

  const nav = NAV;
  const initials = (me?.user.name || 'C').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile topbar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-teal-600 grid place-items-center shrink-0"><Globe2 className="h-4 w-4 text-white" /></div>
          <span className="font-bold truncate">CaribClear</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotifBell unread={unread} notifs={notifs} markAll={markAll} />
          <Button variant="ghost" size="icon" aria-label="Toggle menu" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        'lg:sticky lg:top-0 lg:h-screen w-full lg:w-60 shrink-0 border-r bg-background z-30 flex flex-col',
        menuOpen ? 'block' : 'hidden lg:flex',
      )}>
        <div className="hidden lg:flex items-center gap-2 h-16 px-5 border-b min-w-0">
          <div className="h-8 w-8 rounded-lg bg-teal-600 grid place-items-center shrink-0"><Globe2 className="h-5 w-5 text-white" /></div>
          <div className="min-w-0">
            <div className="font-bold leading-tight">CaribClear</div>
            <div className="text-xs text-muted-foreground truncate">{me?.tenant?.name ?? '…'}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {nav.map(item => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-teal-600/10 text-teal-700 dark:text-teal-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          {me?.tenant && (
            <div className="flex items-center justify-between px-2 mb-2">
              <Badge variant="secondary" className={me.tenant.plan === 'pro' ? 'bg-amber-500/15 text-amber-700 border-0' : ''}>
                {me.tenant.plan.toUpperCase()}
              </Badge>
              <span className="text-xs text-muted-foreground">FX {me.tenant.defaultExchangeRate}</span>
            </div>
          )}
          <Button variant="outline" className="w-full justify-start gap-3" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop topbar */}
        <header className="hidden lg:flex sticky top-0 z-40 h-16 items-center justify-between border-b bg-background/80 backdrop-blur px-6">
          <div className="text-sm text-muted-foreground truncate">
            {me ? `Welcome back, ${me.user.name.split(' ')[0]} · ${me.user.email}` : 'Loading…'}
          </div>
          <div className="flex items-center gap-2">
            <NotifBell unread={unread} notifs={notifs} markAll={markAll} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 w-9 rounded-full bg-teal-600 text-white font-bold text-sm">{initials}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div>{me?.user.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{me?.user.role.replace(/_/g, ' ')}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}><Settings className="h-4 w-4 mr-2" /> Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={logout}><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function NotifBell({ unread, notifs, markAll }: { unread: number; notifs: Notif[]; markAll: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-500" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Alerts</span>
          <button className="text-xs text-teal-600 hover:underline" onClick={markAll}>Mark all read</button>
        </div>
        {notifs.length === 0 && <p className="text-sm text-muted-foreground px-2 py-4">No alerts — smooth sailing. 🌊</p>}
        {notifs.slice(0, 12).map(n => (
          <DropdownMenuLabel key={n.id} className="font-normal border-b last:border-0 py-2.5">
            <div className="flex items-start gap-2">
              <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0',
                n.severity === 'critical' ? 'bg-rose-600' : n.severity === 'warning' ? 'bg-amber-500' : 'bg-teal-600',
                n.readAt && 'opacity-30')} />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">{n.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{fmtDate(n.createdAt)}</div>
              </div>
            </div>
          </DropdownMenuLabel>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
