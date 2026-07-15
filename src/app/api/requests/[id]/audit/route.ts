import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/** GET /api/requests/:id/audit — audit trail + email send logs for a record. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession('read');
  if (auth instanceof NextResponse) return auth;

  const [auditLogs, emailLogs, request] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: 'REQUEST', entityId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.emailSendLog.findMany({
      where: { requestId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, toRecipients: true, ccRecipients: true, subject: true,
        status: true, graphMessageId: true, errorMessage: true, sentBy: true,
        sentAt: true, createdAt: true,
      },
    }),
    prisma.onboardingRequest.findUnique({ where: { id: params.id } }),
  ]);

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  return NextResponse.json({ auditLogs, emailLogs });
}
