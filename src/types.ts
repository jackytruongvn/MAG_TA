export type RequestType = 'CREATE' | 'UPDATE' | 'CANCELLED';
export type Priority = 'NORMAL' | 'URGENT';
export type RequestStatus = 'DRAFT' | 'PENDING' | 'SCHEDULED' | 'SENT' | 'FAILED' | 'CANCELLED';
export type Role = 'ADMIN' | 'TA' | 'VIEWER';

export const REQUEST_TYPES: RequestType[] = ['CREATE', 'UPDATE', 'CANCELLED'];
export const PRIORITIES: Priority[] = ['NORMAL', 'URGENT'];
export const STATUSES: RequestStatus[] = ['DRAFT', 'PENDING', 'SCHEDULED', 'SENT', 'FAILED', 'CANCELLED'];

/** One editable row in the entry grids / one onboarding_requests record payload. */
export interface RowData {
  [key: string]: string;
}

export interface EmailSettings {
  senderMailbox: string;
  defaultTo: string[];
  autoFillCcFromLineManager: boolean;
  allowManualCcEdit: boolean;
  allowUrgentSend: boolean;
}

export interface ScheduleSettings {
  enabled: boolean;
  sendTimes: string[]; // "HH:mm" in the configured timezone
  timezone: string; // e.g. Asia/Ho_Chi_Minh
  onlyWorkingDays: boolean;
}

export interface TemplateDef {
  subject: string;
  body: string;
}

export interface ColumnOverride {
  key: string;
  label?: string;
  visible?: boolean;
  required?: boolean;
}

export interface RolesConfig {
  admins: string[];
  taUsers: string[];
  viewers: string[];
  defaultRole: Role;
  taCanViewAll: boolean;
}

export interface AppConfigShape {
  emailSettings: EmailSettings;
  scheduleSettings: ScheduleSettings;
  templates: Record<RequestType, TemplateDef>;
  columns: ColumnOverride[];
  roles: RolesConfig;
}

export interface EmailPreview {
  subject: string;
  to: string[];
  cc: string[];
  html: string;
}

export interface CellErrors {
  /** rowIndex -> field key -> error message */
  [rowIndex: number]: Record<string, string>;
}
