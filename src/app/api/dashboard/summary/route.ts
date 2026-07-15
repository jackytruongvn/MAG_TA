import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';
import { getConfig } from '@/lib/config';
import { wallClockInTz, wallTimeToUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSession('read');
  if (auth instanceof NextResponse) return auth;

  const config = await getConfig();
  const tz = config.scheduleSettings.timezone || 'Asia/Ho_Chi_Minh';
  const wc = wallClockInTz(tz);
  const startOfDay = wallTimeToUtc(tz, wc.y, wc.m, wc.d, 0, 0);

  const [totalToday, pendingSchedule, sentToday, failed, urgentSentToday, createdByMe] = await Promise.all([
    prisma.onboardingRequest.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.onboardingRequest.count({ where: { status: { in: ['PENDING', 'SCHEDULED'] } } }),
    prisma.onboardingRequest.count({ where: { status: 'SENT', sentAt: { gte: startOfDay } } }),
    prisma.onboardingRequest.count({ where: { status: 'FAILED' } }),
    prisma.onboardingRequest.count({ where: { status: 'SENT', priority: 'URGENT', sentAt: { gte: startOfDay } } }),
    prisma.onboardingRequest.count({ where: { createdByEmail: auth.email } }),
  ]);

  return NextResponse.json({ totalToday, pendingSchedule, sentToday, failed, urgentSentToday, createdByMe });
}
