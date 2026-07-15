import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { getConfig, setConfigKey, safeConfigFor, DEFAULT_CONFIG } from '@/lib/config';
import { writeAudit } from '@/lib/audit';
import type { AppConfigShape } from '@/types';

export const dynamic = 'force-dynamic';

/** GET /api/config — full config for ADMIN, safe subset for others. */
export async function GET() {
  const auth = await requireSession('read');
  if (auth instanceof NextResponse) return auth;

  const config = await getConfig();
  return NextResponse.json({ config: safeConfigFor(config, auth.role), role: auth.role });
}

/** PUT /api/config { key, value } — admin only, audited. */
export async function PUT(req: NextRequest) {
  const auth = await requireSession('admin');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const key = body?.key as keyof AppConfigShape;
  const value = body?.value;

  if (!key || !(key in DEFAULT_CONFIG) || value === undefined) {
    return NextResponse.json(
      { error: `key must be one of: ${Object.keys(DEFAULT_CONFIG).join(', ')}` },
      { status: 400 },
    );
  }

  const old = (await getConfig())[key];
  await setConfigKey(key, value, auth.email);
  await writeAudit({
    entityType: 'CONFIG', entityId: key, action: 'CONFIG_UPDATE',
    actorEmail: auth.email, oldValue: old, newValue: value,
  });

  return NextResponse.json({ ok: true });
}
