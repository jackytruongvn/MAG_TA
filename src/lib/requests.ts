import { randomUUID } from 'crypto';
import type { OnboardingRequest, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getConfig } from '@/lib/config';
import { getColumnsForType } from '@/lib/columns';
import { validateRow } from '@/lib/validation/request';
import { normalizeRowValues } from '@/lib/parseExcel';
import { parseDateOnly } from '@/lib/dates';
import { computeNextSendSlot } from '@/lib/scheduler';
import { sendRequestEmails, type SendOutcome } from '@/lib/email/send';
import { writeAudit } from '@/lib/audit';
import { splitEmails, uniqueEmails } from '@/lib/utils';
import type { AppConfigShape, RequestType, RowData } from '@/types';

/** Row fields that may be persisted onto onboarding_requests. */
const ROW_FIELDS = [
  'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
  'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
  'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'accountEmail', 'phoneNumber',
  'company', 'lienQuan', 'cc', 'notes', 'updateReason', 'fieldsChanged', 'cancelReason',
] as const;

export type SubmitMode = 'draft' | 'submit' | 'urgent';

export interface BulkCreateResult {
  batchId: string;
  createdIds: string[];
  status: string;
  scheduledSendAt: string | null;
  send?: SendOutcome;
  validationErrors?: Record<number, Record<string, string>>;
}

function rowToData(row: RowData, type: RequestType, config: AppConfigShape): Prisma.OnboardingRequestUncheckedCreateInput {
  const data: Record<string, string | null> = {};
  for (const f of ROW_FIELDS) {
    const v = (row[f] ?? '').trim();
    data[f] = v === '' ? null : v;
  }
  // dates stored as ISO date-only strings
  data.dob = data.dob ? parseDateOnly(data.dob) : null;
  data.startingDate = data.startingDate ? parseDateOnly(data.startingDate) : null;

  // Cc default: auto-fill from Line Manager email
  if (!data.cc && config.emailSettings.autoFillCcFromLineManager && data.lineManagerEmail) {
    data.cc = data.lineManagerEmail;
  }
  if (data.cc) data.cc = uniqueEmails(splitEmails(data.cc)).join('; ');

  const priority = (row.priority ?? '').trim().toLowerCase() === 'urgent' ? 'URGENT' : 'NORMAL';

  return {
    ...(data as Record<string, string | null>),
    fullName: (row.fullName ?? '').trim(),
    requestType: type,
    priority,
    idempotencyKey: randomUUID(),
  } as Prisma.OnboardingRequestUncheckedCreateInput;
}

/**
 * Create a batch of requests from entry-grid rows.
 * mode=draft  -> DRAFT, no validation gate
 * mode=submit -> URGENT rows send now (if allowed), NORMAL rows get SCHEDULED/PENDING
 * mode=urgent -> all rows send immediately (if allowed)
 */
export async function createBulk(
  type: RequestType,
  rows: RowData[],
  mode: SubmitMode,
  actorEmail: string,
): Promise<BulkCreateResult | { validationErrors: Record<number, Record<string, string>> }> {
  const config = await getConfig();
  const columns = getColumnsForType(type, config.columns);
  const normalized = rows.map((r) => normalizeRowValues(r, columns));

  if (mode !== 'draft') {
    const validationErrors: Record<number, Record<string, string>> = {};
    normalized.forEach((row, i) => {
      const e = validateRow(row, columns);
      if (Object.keys(e).length > 0) validationErrors[i] = e;
    });
    if (Object.keys(validationErrors).length > 0) return { validationErrors };
  }

  const batchId = randomUUID();
  const createdIds: string[] = [];

  for (const row of normalized) {
    const data = rowToData(row, type, config);
    if (mode === 'urgent') (data as { priority: string }).priority = 'URGENT';
    const created = await prisma.onboardingRequest.create({
      data: {
        ...data,
        batchId,
        status: 'DRAFT',
        createdByEmail: actorEmail,
      },
    });
    createdIds.push(created.id);
    await writeAudit({
      entityType: 'REQUEST', entityId: created.id, action: 'CREATE',
      actorEmail, newValue: { ...row, batchId, mode },
    });
  }

  if (mode === 'draft') {
    return { batchId, createdIds, status: 'DRAFT', scheduledSendAt: null };
  }

  const submitResult = await submitRequests(createdIds, actorEmail);
  return { batchId, createdIds, ...submitResult };
}

export interface SubmitResult {
  status: string;
  scheduledSendAt: string | null;
  send?: SendOutcome;
}

/**
 * Submit existing requests: URGENT -> send now (when allowed by config),
 * NORMAL -> SCHEDULED at next configured slot (or PENDING when schedule disabled).
 */
export async function submitRequests(ids: string[], actorEmail: string): Promise<SubmitResult> {
  const config = await getConfig();
  const requests = await prisma.onboardingRequest.findMany({ where: { id: { in: ids } } });

  const urgent = requests.filter((r) => r.priority === 'URGENT' && r.status !== 'SENT');
  const normal = requests.filter((r) => r.priority !== 'URGENT' && r.status !== 'SENT');

  const slot = computeNextSendSlot(config.scheduleSettings);
  const normalStatus = slot ? 'SCHEDULED' : 'PENDING';

  for (const r of normal) {
    await prisma.onboardingRequest.update({
      where: { id: r.id },
      data: {
        status: normalStatus,
        scheduledSendAt: slot,
        submittedByEmail: actorEmail,
        updatedByEmail: actorEmail,
      },
    });
    await writeAudit({
      entityType: 'REQUEST', entityId: r.id, action: 'SUBMIT', actorEmail,
      newValue: { status: normalStatus, scheduledSendAt: slot?.toISOString() ?? null },
    });
  }

  let send: SendOutcome | undefined;
  if (urgent.length > 0) {
    if (!config.emailSettings.allowUrgentSend) {
      // urgent not allowed -> fall back to queue
      for (const r of urgent) {
        await prisma.onboardingRequest.update({
          where: { id: r.id },
          data: { status: normalStatus, scheduledSendAt: slot, submittedByEmail: actorEmail, updatedByEmail: actorEmail },
        });
      }
    } else {
      for (const r of urgent) {
        await prisma.onboardingRequest.update({
          where: { id: r.id },
          data: { submittedByEmail: actorEmail, updatedByEmail: actorEmail },
        });
        await writeAudit({ entityType: 'REQUEST', entityId: r.id, action: 'SEND_URGENT', actorEmail });
      }
      const fresh = await prisma.onboardingRequest.findMany({ where: { id: { in: urgent.map((r) => r.id) } } });
      send = await sendRequestEmails(fresh, actorEmail, { trigger: 'URGENT' });
    }
  }

  return {
    status: urgent.length > 0 && normal.length === 0 ? 'SENT' : normalStatus,
    scheduledSendAt: slot?.toISOString() ?? null,
    send,
  };
}

/** Editable fields for bulk PATCH (audit-logged, SENT rows are skipped). */
const BULK_EDITABLE = new Set<string>([...ROW_FIELDS, 'priority']);

export async function bulkEdit(
  ids: string[],
  fields: Record<string, string>,
  actorEmail: string,
): Promise<{ updated: number; skipped: number }> {
  const requests = await prisma.onboardingRequest.findMany({ where: { id: { in: ids } } });
  let updated = 0;
  let skipped = 0;

  const data: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!BULK_EDITABLE.has(k)) continue;
    if (k === 'priority') {
      data[k] = String(v).trim().toLowerCase() === 'urgent' ? 'URGENT' : 'NORMAL';
    } else if (k === 'dob' || k === 'startingDate') {
      data[k] = v ? parseDateOnly(String(v)) : null;
    } else {
      data[k] = String(v).trim() === '' ? null : String(v).trim();
    }
  }
  if (Object.keys(data).length === 0) return { updated: 0, skipped: requests.length };

  for (const r of requests) {
    if (r.status === 'SENT') { skipped++; continue; }
    const old: Record<string, unknown> = {};
    for (const k of Object.keys(data)) old[k] = (r as Record<string, unknown>)[k];
    await prisma.onboardingRequest.update({
      where: { id: r.id },
      data: { ...data, updatedByEmail: actorEmail },
    });
    await writeAudit({
      entityType: 'REQUEST', entityId: r.id, action: 'BULK_EDIT', actorEmail,
      oldValue: old, newValue: data,
    });
    updated++;
  }
  return { updated, skipped };
}

/**
 * Delete requests. SENT rows are never deleted (their email_send_logs and
 * audit trail are the record of what was actually delivered) — they are
 * reported back as `blocked` instead. A DELETE audit entry is written for
 * each row actually removed.
 */
export async function deleteRequests(ids: string[], actorEmail: string): Promise<{ deleted: number; blocked: number }> {
  const requests = await prisma.onboardingRequest.findMany({ where: { id: { in: ids } } });
  const deletable = requests.filter((r) => r.status !== 'SENT');
  const blocked = requests.length - deletable.length;
  if (deletable.length === 0) return { deleted: 0, blocked };

  const deletableIds = deletable.map((r) => r.id);
  await prisma.$transaction([
    prisma.emailSendLog.deleteMany({ where: { requestId: { in: deletableIds } } }),
    prisma.onboardingRequest.deleteMany({ where: { id: { in: deletableIds } } }),
  ]);

  for (const r of deletable) {
    await writeAudit({ entityType: 'REQUEST', entityId: r.id, action: 'DELETE', actorEmail, oldValue: r });
  }

  return { deleted: deletable.length, blocked };
}

export function requestToRowData(r: OnboardingRequest): RowData {
  const row: RowData = { priority: r.priority === 'URGENT' ? 'Urgent' : 'Normal' };
  for (const f of ROW_FIELDS) row[f] = ((r as Record<string, unknown>)[f] as string | null) ?? '';
  return row;
}
