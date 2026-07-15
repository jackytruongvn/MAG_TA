import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';
import { getConfig } from '@/lib/config';
import { sendRequestEmails } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

/**
 * POST /api/requests/send-urgent { ids, resend? }
 * Sends immediately. Rows already SENT are refused unless resend=true
 * (explicit user confirmation in the UI).
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const ids = body?.ids as string[];
  const resend = body?.resend === true;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids are required' }, { status: 400 });
  }

  const config = await getConfig();
  if (!config.emailSettings.allowUrgentSend) {
    return NextResponse.json({ error: 'Urgent send is disabled in Config > Email Settings' }, { status: 400 });
  }

  const requests = await prisma.onboardingRequest.findMany({ where: { id: { in: ids } } });
  if (requests.length === 0) return NextResponse.json({ error: 'No requests found' }, { status: 404 });

  const alreadySent = requests.filter((r) => r.status === 'SENT');
  if (alreadySent.length > 0 && !resend) {
    return NextResponse.json(
      {
        error: 'Some requests were already sent. Confirm resend to proceed.',
        alreadySentIds: alreadySent.map((r) => r.id),
      },
      { status: 409 },
    );
  }

  for (const r of requests) {
    if (!r.submittedByEmail) {
      await prisma.onboardingRequest.update({
        where: { id: r.id },
        data: { submittedByEmail: auth.email },
      });
    }
  }
  const fresh = await prisma.onboardingRequest.findMany({ where: { id: { in: ids } } });
  const outcome = await sendRequestEmails(fresh, auth.email, {
    allowResend: resend,
    trigger: resend ? 'RESEND' : 'URGENT',
  });
  return NextResponse.json(outcome);
}
