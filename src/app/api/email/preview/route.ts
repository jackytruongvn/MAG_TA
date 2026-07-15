import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { getConfig } from '@/lib/config';
import { buildEmail } from '@/lib/email/templates';
import { getColumnsForType } from '@/lib/columns';
import { normalizeRowValues } from '@/lib/parseExcel';
import { REQUEST_TYPES, type RequestType, type RowData } from '@/types';

export const dynamic = 'force-dynamic';

/** POST /api/email/preview { requestType, rows } — renders subject/to/cc/html. */
export async function POST(req: NextRequest) {
  const auth = await requireSession('read');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const requestType = body?.requestType as RequestType;
  const rows = body?.rows as RowData[];

  if (!REQUEST_TYPES.includes(requestType) || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'requestType and non-empty rows are required' }, { status: 400 });
  }

  const config = await getConfig();
  const columns = getColumnsForType(requestType, config.columns);
  const normalized = rows.map((r) => {
    const row = normalizeRowValues(r, columns);
    if (!row.cc && config.emailSettings.autoFillCcFromLineManager && row.lineManagerEmail) {
      row.cc = row.lineManagerEmail;
    }
    return row;
  });
  const preview = buildEmail(requestType, normalized, config, auth.email);
  return NextResponse.json(preview);
}
