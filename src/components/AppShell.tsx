'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/create', label: 'Create', icon: '🆕' },
  { href: '/update', label: 'Update', icon: '✏️' },
  { href: '/cancelled', label: 'Cancelled', icon: '🚫' },
  { href: '/config', label: 'Config', icon: '⚙️', adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user?.role ?? 'VIEWER';

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-52 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <Image src="/logo-masterise.png" alt="Masterise Group" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
          <div>
            <div className="text-sm font-bold leading-tight text-brand-700">HR TA Onboarding</div>
            <div className="text-xs text-slate-500">Input Portal</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.filter((n) => !n.adminOnly || role === 'ADMIN').map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                pathname?.startsWith(n.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="ml-52 flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <h1 className="text-sm font-semibold text-slate-700">HR TA Onboarding Input Portal</h1>
          <div className="flex items-center gap-3">
            {session?.user && (
              <>
                <div className="text-right">
                  <div className="text-sm font-medium text-slate-700">{session.user.email}</div>
                </div>
                <span
                  className={cn(
                    'badge',
                    role === 'ADMIN' && 'bg-purple-100 text-purple-700',
                    role === 'TA' && 'bg-brand-100 text-brand-700',
                    role === 'VIEWER' && 'bg-slate-200 text-slate-600',
                  )}
                >
                  {role}
                </span>
                <button className="btn-outline btn-sm" onClick={() => signOut({ callbackUrl: '/login' })}>
                  Logout
                </button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
