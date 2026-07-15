import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { createBulk, bulkEdit, deleteRequests, type SubmitMode } from '@/lib/requests';
import { REQUEST_TYPES, type RequestType, type RowData } from '@/types';

export const dynamic = 'force-dynamic';

/** POST /api/requests/bulk  { requestType, rows, mode: draft|submit|urgent } */
export async function POST(req: NextRequest) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const requestType = body?.requestType as RequestType;
  const rows = body?.rows as RowData[];
  const mode = (body?.mode ?? 'submit') as SubmitMode;

  if (!REQUEST_TYPES.includes(requestType) || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'requestType and non-empty rows are required' }, { status: 400 });
  }
  if (!['draft', 'submit', 'urgent'].includes(mode)) {
    return NextResponse.json({ error: 'mode must be draft | submit | urgent' }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: 'Too many rows (max 500 per batch)' }, { status: 400 });
  }

  const result = await createBulk(requestType, rows, mode, auth.email);
  if ('validationErrors' in result && !('batchId' in result)) {
    return NextResponse.json({ error: 'Validation failed', ...result }, { status: 400 });
  }
  return NextResponse.json(result);
}

/** PATCH /api/requests/bulk  { ids, fields } — bulk edit selected rows. */
export async function PATCH(req: NextRequest) {
  const auth = await requireSession('write');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const ids = body?.ids as string[];
  const fields = body?.fields as Record<string, string>;

  if (!Array.isArray(ids) || ids.length === 0 || !fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'ids and fields are required' }, { status: 400 });
  }

  const result = await bulkEdit(ids, fields, auth.email);
  return NextResponse.json(result);
}

/** DELETE /api/requests/bulk  { ids } — Admin only. Delete selected rows (SENT rows are protected, not deleted). */
export async function DELETE(req: NextRequest) {
  const auth = await requireSession('admin');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const ids = body?.ids as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids are required' }, { status: 400 });
  }

  const result = await deleteRequests(ids, auth.email);
  if (result.deleted === 0) {
    return NextResponse.json(
      { error: 'Selected requests are already SENT and cannot be deleted (audit trail is protected).', ...result },
      { status: 400 },
    );
  }
  return NextResponse.json(result);
}
