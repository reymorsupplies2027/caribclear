import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { TowerNav } from './tower-nav';

export const metadata = { title: 'CaribClear — Control Tower', robots: { index: false, follow: false } };

export default async function TowerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'super_admin') redirect('/login');
  return (
    <div className="min-h-screen bg-background">
      <TowerNav name={session.name} email={session.email} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
