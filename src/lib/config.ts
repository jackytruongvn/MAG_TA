import { prisma } from '@/lib/db/prisma';
import type { AppConfigShape, RequestType, Role } from '@/types';
import { PAGE_COLUMNS, ALL_COLUMNS } from '@/lib/columns';

export const DEFAULT_TEMPLATES: Record<RequestType, { subject: string; body: string }> = {
  CREATE: {
    subject: 'Onboarding | {{StartingDate}} | {{OfficeLocation}}',
    body: `<p>Dear IT team,</p>
<p>Kindly prepare onboarding for below newcomer(s) as below:</p>
{{RowsTable}}
<p>Thanks &amp; Best Regards,</p>
<p>{{SubmittedByEmail}}</p>`,
  },
  UPDATE: {
    subject: 'Update Onboarding | {{StartingDate}} | {{OfficeLocation}}',
    body: `<p>Dear team,</p>
<p>Please kindly update the onboarding information for below newcomer(s):</p>
{{RowsTable}}
<p>Update reason:<br/>{{UpdateReason}}</p>
<p>Thanks &amp; Best Regards,</p>
<p>{{SubmittedByEmail}}</p>`,
  },
  CANCELLED: {
    subject: 'Cancelled Onboarding | {{StartingDate}} | {{OfficeLocation}}',
    body: `<p>Dear team,</p>
<p>Please be informed that the onboarding request for below newcomer(s) has been cancelled:</p>
{{RowsTable}}
<p>Cancel reason:<br/>{{CancelReason}}</p>
<p>Thanks &amp; Best Regards,</p>
<p>{{SubmittedByEmail}}</p>`,
  },
};

/** Column overrides default: every known entry column, visible, default label. */
const DEFAULT_COLUMN_OVERRIDES = Array.from(
  new Set([...PAGE_COLUMNS.CREATE, ...PAGE_COLUMNS.UPDATE, ...PAGE_COLUMNS.CANCELLED]),
).map((key) => ({
  key,
  label: ALL_COLUMNS[key].label,
  visible: true,
  required: !!ALL_COLUMNS[key].required,
}));

export const DEFAULT_CONFIG: AppConfigShape = {
  emailSettings: {
    senderMailbox: 'hr.support@masterisegroup.com',
    defaultTo: [
      'Onboarding@masterisehomes.com',
      'talentacquisition@masterisegroup.com',
      'hrbp@masterisehomes.com',
    ],
    autoFillCcFromLineManager: true,
    allowManualCcEdit: true,
    allowUrgentSend: true,
  },
  scheduleSettings: {
    enabled: true,
    sendTimes: ['08:30', '11:30', '15:30'],
    timezone: 'Asia/Ho_Chi_Minh',
    onlyWorkingDays: true,
  },
  templates: DEFAULT_TEMPLATES,
  columns: DEFAULT_COLUMN_OVERRIDES,
  roles: {
    admins: [],
    taUsers: [],
    viewers: [],
    defaultRole: 'TA' as Role,
    taCanViewAll: true,
  },
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof AppConfigShape)[];

/** Load full config from DB, falling back to defaults per top-level key. */
export async function getConfig(): Promise<AppConfigShape> {
  const rows = await prisma.appConfig.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  const cfg = { ...DEFAULT_CONFIG } as AppConfigShape;
  for (const key of CONFIG_KEYS) {
    const raw = byKey.get(key);
    if (raw) {
      try {
        const target = cfg as unknown as Record<string, unknown>;
        const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;
        const parsed = JSON.parse(raw);
        target[key] = Array.isArray(defaults[key])
          ? parsed
          : { ...(defaults[key] as object), ...parsed };
      } catch {
        // keep default when stored JSON is corrupt
      }
    }
  }
  return cfg;
}

export async function setConfigKey(key: keyof AppConfigShape, value: unknown, actorEmail: string) {
  await prisma.appConfig.upsert({
    where: { key },
    update: { valueJson: JSON.stringify(value), updatedByEmail: actorEmail },
    create: { key, valueJson: JSON.stringify(value), updatedByEmail: actorEmail },
  });
}

/** Non-admin clients get config without the roles list. */
export function safeConfigFor(config: AppConfigShape, role: Role): Partial<AppConfigShape> {
  if (role === 'ADMIN') return config;
  const { roles, ...rest } = config;
  return rest;
}
