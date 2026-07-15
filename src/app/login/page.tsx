'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

function LoginInner() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [devEmail, setDevEmail] = useState('');
  const devMode = process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true';
  const error = params.get('error');

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
            <Image src="/logo-masterise.png" alt="Masterise Group" width={64} height={64} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-xl font-bold text-slate-800">HR TA Onboarding Input Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Internal tool — sign in with your Microsoft account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === 'AccessDenied'
              ? 'Access denied. Your account is not allowed to use this app (check email domain).'
              : `Sign-in error: ${error}`}
          </div>
        )}

        <button
          className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
        >
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        {devMode && (
          <div className="mt-6 border-t border-dashed border-slate-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
              ⚠ Dev mode (local only)
            </p>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="your.email@masterisegroup.com"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
              />
              <button
                className="btn-outline"
                onClick={() => signIn('dev-login', { email: devEmail, callbackUrl: '/dashboard' })}
              >
                Dev sign in
              </button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Access restricted to authorized HR Talent Acquisition staff.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
