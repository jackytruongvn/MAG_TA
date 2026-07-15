import { prisma } from '@/lib/db/prisma';

export async function writeAudit(params: {
  entityType: 'REQUEST' | 'CONFIG' | 'USER';
  entityId: string;
  action: string;
  actorEmail: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorEmail: params.actorEmail,
        oldValueJson: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
        newValueJson: params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
      },
    });
  } catch (e) {
    console.error('[audit] failed to write audit log', e);
  }
}
