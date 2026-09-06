'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { RadioTower, LayoutDashboard, Building2, Receipt, Landmark, Gauge, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle as ThemeSwitch } from '@/components/theme-toggle';

const NAV = [
  { href: '/tower', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/tower/tenants', label: 'Tenants', icon: Building2 },
  { href: '/tower/invoices', label: 'Billing', icon: Receipt },
  { href: '/tower/rates', label: 'Rate Command', icon: Landmark },
  { href: '/tower/health', label: 'Health', icon: Gauge },
];

export function TowerNav({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
        <Link href="/tower" className="flex items-center gap-2 shrink-0">
          <span className="h-7 w-7 rounded-md bg-violet-600 grid place-items-center">
            <RadioTower className="h-4 w-4 text-white" />
          </span>
          <span className="font-bold text-sm hidden sm:block">CaribClear <span className="text-violet-600 dark:text-violet-400">· Control Tower</span></span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0" aria-label="Control tower">
          {NAV.map(n => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-violet-600/10 text-violet-700 dark:text-violet-300 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <n.icon className="h-4 w-4" />
                <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          <ThemeSwitch />
          <div className="hidden sm:block text-right mr-1">
            <p className="text-xs font-semibold leading-tight">{name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{email}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
