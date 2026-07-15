import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { runSchedulerOnce } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

/** POST /api/scheduler/run-once — admin only, manually flush due requests. */
export async function POST() {
  const auth = await requireSession('admin');
  if (auth instanceof NextResponse) return auth;

  const result = await runSchedulerOnce('MANUAL');
  return NextResponse.json(result);
}
