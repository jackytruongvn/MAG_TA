import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';
import { writeAudit } from '@/lib/audit';
import { isValidEmail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/requests/:id  { accountEmail }
 * Records the actual account IT created for this newcomer once they reply.
 * Single-row update (distinct from bulk edit, which applies one value to many rows).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body || !('accountEmail' in body)) {
    return NextResponse.json({ error: 'accountEmail is required' }, { status: 400 });
  }
  const accountEmail = String(body.accountEmail ?? '').trim();
  if (accountEmail && !isValidEmail(accountEmail)) {
    return NextResponse.json({ error: 'Invalid account email format' }, { status: 400 });
  }

  const existing = await prisma.onboardingRequest.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  await prisma.onboardingRequest.update({
    where: { id: params.id },
    data: { accountEmail: accountEmail || null, updatedByEmail: auth.email },
  });
  await writeAudit({
    entityType: 'REQUEST', entityId: params.id, action: 'ACCOUNT_UPDATE', actorEmail: auth.email,
    oldValue: { accountEmail: existing.accountEmail }, newValue: { accountEmail: accountEmail || null },
  });

  return NextResponse.json({ ok: true, accountEmail: accountEmail || null });
}
