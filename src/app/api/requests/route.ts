import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireSession } from '@/lib/auth/guard';
import { getConfig } from '@/lib/config';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/requests?type=&status=&priority=&search=&createdBy=&from=&to=
 * RBAC: ADMIN/VIEWER see all; TA sees own records unless roles.taCanViewAll.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession('read');
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams;
  const where: Prisma.OnboardingRequestWhereInput = {};

  const type = q.get('type');
  if (type && type !== 'All') where.requestType = type;
  const status = q.get('status');
  if (status && status !== 'All') where.status = status;
  const priority = q.get('priority');
  if (priority && priority !== 'All') where.priority = priority;
  const createdBy = q.get('createdBy');
  if (createdBy) where.createdByEmail = { contains: createdBy };
  const from = q.get('from');
  const to = q.get('to');
  if (from || to) {
    where.startingDate = {};
    if (from) (where.startingDate as Prisma.StringNullableFilter).gte = from;
    if (to) (where.startingDate as Prisma.StringNullableFilter).lte = to;
  }

  const search = q.get('search');
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { division: { contains: search } },
      { departmentEng: { contains: search } },
      { company: { contains: search } },
      { location: { contains: search } },
      { officeLocation: { contains: search } },
      { lineManager: { contains: search } },
      { lineManagerEmail: { contains: search } },
      { createdByEmail: { contains: search } },
      { positionEng: { contains: search } },
      { project: { contains: search } },
    ];
  }

  if (auth.role === 'TA') {
    const config = await getConfig();
    if (!config.roles.taCanViewAll) {
      where.createdByEmail = auth.email;
    }
  }

  const requests = await prisma.onboardingRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  return NextResponse.json({ requests, role: auth.role, me: auth.email });
}
