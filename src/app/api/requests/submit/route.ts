import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { submitRequests } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** POST /api/requests/submit { ids } — submit drafts to queue (or urgent send). */
export async function POST(req: NextRequest) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const ids = body?.ids as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids are required' }, { status: 400 });
  }

  const result = await submitRequests(ids, auth.email);
  return NextResponse.json(result);
}
