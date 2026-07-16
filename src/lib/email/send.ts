import type { OnboardingRequest } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getConfig } from '@/lib/config';
import { buildEmail } from '@/lib/email/templates';
import { sendMailViaGraph, getSenderMailbox } from '@/lib/email/graph';
import { writeAudit } from '@/lib/audit';
import type { RequestType, RowData } from '@/types';

export interface SendOutcome {
  sent: string[];
  failed: string[];
  errors: Record<string, string>;
}

function requestToRow(r: OnboardingRequest): RowData {
  return {
    salutation: r.salutation ?? '', fullName: r.fullName, dob: r.dob ?? '',
    positionEng: r.positionEng ?? '', positionVie: r.positionVie ?? '', jobLevel: r.jobLevel ?? '',
    division: r.division ?? '', departmentEng: r.departmentEng ?? '', departmentVie: r.departmentVie ?? '',
    functionEng: r.functionEng ?? '', functionVie: r.functionVie ?? '',
    startingDate: r.startingDate ?? '', location: r.location ?? '', officeLocation: r.officeLocation ?? '',
    project: r.project ?? '', lineManager: r.lineManager ?? '', lineManagerEmail: r.lineManagerEmail ?? '',
    workEmail: r.workEmail ?? '', accountEmail: r.accountEmail ?? '', phoneNumber: r.phoneNumber ?? '', company: r.company ?? '',
    lienQuan: r.lienQuan ?? '', priority: r.priority, cc: r.cc ?? '', notes: r.notes ?? '',
    updateReason: r.updateReason ?? '', fieldsChanged: r.fieldsChanged ?? '',
    cancelReason: r.cancelReason ?? '',
  };
}

/**
 * Group requests into one email per requestType so a whole day's batch of
 * Create/Update/Cancelled requests goes out as a single email each, instead
 * of one email per row. Each row's own Starting Date / Office Location still
 * shows correctly inside the RowsTable — only the grouping key ignores them.
 */
export function groupForSending(requests: OnboardingRequest[]): Map<string, OnboardingRequest[]> {
  const groups = new Map<string, OnboardingRequest[]>();
  for (const r of requests) {
    const key = r.requestType;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Send one email per group and persist results (status, sentAt, sendError,
 * email_send_logs, audit_logs). Never sends a request already SENT unless
 * `allowResend` is set (explicit "Resend" with confirmation).
 */
export async function sendRequestEmails(
  requests: OnboardingRequest[],
  actorEmail: string,
  opts: { allowResend?: boolean; trigger: 'URGENT' | 'SCHEDULER' | 'RETRY' | 'RESEND' } ,
): Promise<SendOutcome> {
  const outcome: SendOutcome = { sent: [], failed: [], errors: {} };
  const config = await getConfig();

  const eligible = requests.filter((r) => {
    if (r.status === 'SENT' && !opts.allowResend) {
      outcome.errors[r.id] = 'Already sent (use Resend with confirmation)';
      return false;
    }
    return true;
  });

  for (const group of Array.from(groupForSending(eligible).values())) {
    const type = group[0].requestType as RequestType;
    const rows = group.map(requestToRow);
    const submittedBy = group[0].submittedByEmail || actorEmail;
    const email = buildEmail(type, rows, config, submittedBy);
    const result = await sendMailViaGraph({ to: email.to, cc: email.cc, subject: email.subject, html: email.html });
    const now = new Date();

    for (const r of group) {
      if (result.ok) {
        await prisma.onboardingRequest.update({
          where: { id: r.id },
          data: {
            status: 'SENT', sentAt: now, sendError: null,
            emailSubject: email.subject, emailBodyHtml: email.html,
            updatedByEmail: actorEmail,
          },
        });
        outcome.sent.push(r.id);
      } else {
        await prisma.onboardingRequest.update({
          where: { id: r.id },
          data: { status: 'FAILED', sendError: result.error ?? 'Unknown error', updatedByEmail: actorEmail },
        });
        outcome.failed.push(r.id);
        outcome.errors[r.id] = result.error ?? 'Unknown error';
      }

      await prisma.emailSendLog.create({
        data: {
          requestId: r.id,
          requestType: type,
          toRecipients: email.to.join('; '),
          ccRecipients: email.cc.join('; '),
          subject: email.subject,
          bodyHtml: email.html,
          status: result.ok ? 'SENT' : 'FAILED',
          graphMessageId: result.messageId ?? null,
          errorMessage: result.error ?? null,
          sentBy: `${getSenderMailbox()} (trigger: ${opts.trigger} by ${actorEmail})`,
          sentAt: result.ok ? now : null,
        },
      });
      await writeAudit({
        entityType: 'REQUEST', entityId: r.id,
        action: result.ok ? (opts.trigger === 'RESEND' ? 'RESEND' : 'SENT') : 'FAILED',
        actorEmail,
        newValue: { subject: email.subject, to: email.to, cc: email.cc, error: result.error ?? null },
      });
    }
  }

  return outcome;
}
