import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/options';
import type { Role } from '@/types';
import { canWrite, isAdmin } from '@/lib/auth/rbac';

export interface SessionInfo {
  email: string;
  role: Role;
}

/**
 * API guard. Returns the session info, or a NextResponse error to return
 * directly. Usage:
 *   const auth = await requireSession('write');
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireSession(
  level: 'read' | 'write' | 'admin' = 'read',
): Promise<SessionInfo | NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in with Microsoft.' }, { status: 401 });
  }
  const role = session.user.role ?? 'VIEWER';
  if (level === 'write' && !canWrite(role)) {
    return NextResponse.json({ error: 'Forbidden. TA or Admin role required.' }, { status: 403 });
  }
  if (level === 'admin' && !isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden. Admin role required.' }, { status: 403 });
  }
  return { email: email.toLowerCase(), role };
}
