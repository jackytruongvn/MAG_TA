import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';
import { sendRequestEmails } from '@/lib/email/send';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST /api/requests/retry { ids } — retry FAILED sends immediately. */
export async function POST(req: NextRequest) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const ids = body?.ids as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids are required' }, { status: 400 });
  }

  const failed = await prisma.onboardingRequest.findMany({
    where: { id: { in: ids }, status: 'FAILED' },
  });
  if (failed.length === 0) {
    return NextResponse.json({ error: 'No FAILED requests among the selection' }, { status: 400 });
  }

  for (const r of failed) {
    await writeAudit({ entityType: 'REQUEST', entityId: r.id, action: 'RETRY', actorEmail: auth.email });
  }
  const outcome = await sendRequestEmails(failed, auth.email, { trigger: 'RETRY' });
  return NextResponse.json(outcome);
}
