import type { ColumnOverride, RequestType } from '@/types';
import { normalizeHeader } from '@/lib/utils';

export type ColumnType = 'text' | 'date' | 'select' | 'emails' | 'email' | 'textarea' | 'multiselect';

export interface ColumnDef {
  key: string;
  label: string;
  /** normalized aliases used to auto-detect pasted Excel headers */
  aliases: string[];
  type: ColumnType;
  options?: string[];
  /** options for a 'multiselect' column, e.g. the pickable field names for Fields Changed */
  multiOptions?: { key: string; label: string }[];
  required?: boolean;
  width?: number; // px hint for the entry grid
}

const C = (
  key: string,
  label: string,
  aliases: string[],
  type: ColumnType = 'text',
  extra: Partial<ColumnDef> = {},
): ColumnDef => ({ key, label, aliases, type, width: 150, ...extra });

/** Master definition of every known column. */
export const ALL_COLUMNS: Record<string, ColumnDef> = {
  salutation: C('salutation', 'Salutation', ['salutation', 'title', 'danhxung'], 'text', { width: 90 }),
  fullName: C('fullName', 'Full name', ['fullname', 'name', 'hoten', 'hovaten'], 'text', { required: true, width: 190 }),
  dob: C('dob', 'DOB', ['dob', 'dateofbirth', 'birthday', 'ngaysinh'], 'date', { width: 120 }),
  positionEng: C('positionEng', 'Position_ENG', ['positioneng', 'position', 'chucdanheng'], 'text', { width: 170 }),
  positionVie: C('positionVie', 'Position_VIE', ['positionvie', 'chucdanh', 'chucdanhvie'], 'text', { width: 170 }),
  jobLevel: C('jobLevel', 'Job Level', ['joblevel', 'level', 'capbac'], 'text', { width: 100 }),
  division: C('division', 'Division', ['division', 'khoi'], 'text', { width: 140 }),
  departmentEng: C('departmentEng', 'Department_ENG', ['departmenteng', 'department', 'phongbaneng'], 'text', { width: 170 }),
  departmentVie: C('departmentVie', 'Department_VIE', ['departmentvie', 'phongban', 'phongbanvie'], 'text', { width: 170 }),
  functionEng: C('functionEng', 'Function_ENG', ['functioneng', 'function'], 'text', { width: 150 }),
  functionVie: C('functionVie', 'Function_VIE', ['functionvie'], 'text', { width: 150 }),
  startingDate: C('startingDate', 'Starting Date', ['startingdate', 'startdate', 'ngaybatdau', 'ngayonboard', 'onboarddate'], 'date', { required: true, width: 125 }),
  location: C('location', 'Location', ['location', 'diadiem'], 'text', { width: 120 }),
  officeLocation: C('officeLocation', 'Office Location', ['officelocation', 'office', 'vanphong'], 'text', { width: 150 }),
  project: C('project', 'Project', ['project', 'duan'], 'text', { width: 130 }),
  lineManager: C('lineManager', 'Line Manager', ['linemanager', 'manager', 'quanlytructiep'], 'text', { width: 170 }),
  lineManagerEmail: C('lineManagerEmail', 'Line Manager email', ['linemanageremail', 'manageremail', 'emailquanly'], 'email', { width: 210 }),
  workEmail: C('workEmail', 'Work Email', ['workemail', 'email', 'emailcongviec'], 'text', { width: 100 }),
  phoneNumber: C('phoneNumber', 'Phone Number', ['phonenumber', 'phone', 'mobile', 'sodienthoai', 'sdt'], 'text', { width: 130 }),
  company: C('company', 'Company', ['company', 'congty'], 'text', { width: 140 }),
  lienQuan: C('lienQuan', 'Liên quân', ['lienquan', 'coalition', 'coalitioncode'], 'text', { width: 110 }),
  priority: C('priority', 'Priority', ['priority', 'uutien'], 'select', { options: ['Normal', 'Urgent'], width: 100 }),
  cc: C('cc', 'Cc', ['cc', 'ccemail', 'ccemails'], 'emails', { width: 230 }),
  notes: C('notes', 'Notes', ['notes', 'note', 'ghichu'], 'textarea', { width: 180 }),
  updateReason: C('updateReason', 'Update Reason', ['updatereason', 'lydoupdate', 'reason'], 'textarea', { width: 190 }),
  fieldsChanged: C('fieldsChanged', 'Fields Changed', ['fieldschanged', 'fieldchanged', 'truongthaydoi'], 'multiselect', { width: 220 }),
  cancelReason: C('cancelReason', 'Cancel Reason', ['cancelreason', 'lydohuy'], 'textarea', { width: 190 }),
};

/** Onboarding-info fields the "Fields Changed" picker offers — matches what gets highlighted in the outgoing email. */
export const UPDATABLE_FIELD_KEYS = [
  'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
  'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
  'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
  'company', 'lienQuan',
];

// Populated here (not inline above) since ALL_COLUMNS must be fully built first.
ALL_COLUMNS.fieldsChanged.multiOptions = UPDATABLE_FIELD_KEYS.map((k) => ({ key: k, label: ALL_COLUMNS[k].label }));

/** Ordered entry-grid columns for each request type. */
export const PAGE_COLUMNS: Record<RequestType, string[]> = {
  CREATE: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan', 'priority', 'cc', 'notes',
  ],
  UPDATE: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan', 'updateReason', 'fieldsChanged',
    'priority', 'cc', 'notes',
  ],
  CANCELLED: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan', 'cancelReason', 'priority', 'cc', 'notes',
  ],
};

/** Columns rendered inside the {{RowsTable}} of each email template. */
export const EMAIL_TABLE_COLUMNS: Record<RequestType, string[]> = {
  CREATE: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan',
  ],
  UPDATE: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan', 'fieldsChanged',
  ],
  CANCELLED: [
    'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
    'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
    'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'phoneNumber',
    'company', 'lienQuan',
  ],
};

/**
 * Resolve the effective entry-grid columns for a request type after applying
 * the admin "Columns" config (custom label / hidden / required overrides;
 * the override array order also defines column order).
 */
export function getColumnsForType(type: RequestType, overrides?: ColumnOverride[]): ColumnDef[] {
  const keys = PAGE_COLUMNS[type];
  const byKey = new Map((overrides ?? []).map((o) => [o.key, o]));

  const ordered = overrides?.length
    ? [...keys].sort((a, b) => {
        const ia = (overrides.findIndex((o) => o.key === a) + 1) || 999;
        const ib = (overrides.findIndex((o) => o.key === b) + 1) || 999;
        return ia - ib;
      })
    : keys;

  return ordered
    .map((k) => {
      const base = ALL_COLUMNS[k];
      const ov = byKey.get(k);
      if (!base) return null;
      if (ov?.visible === false) return null;
      return {
        ...base,
        label: ov?.label || base.label,
        required: ov?.required ?? base.required,
      } as ColumnDef;
    })
    .filter((c): c is ColumnDef => c !== null);
}

/**
 * Match the free-text "Fields Changed" value (e.g. "Division, Starting Date")
 * against a set of column keys, so the outgoing email can highlight exactly
 * those columns' values instead of needing separate Previous/New Value columns.
 * Matches by column label or key, comma/semicolon separated, diacritic- and
 * case-insensitive.
 */
export function parseChangedFieldKeys(fieldsChanged: string | null | undefined, keys: string[]): Set<string> {
  const tokens = (fieldsChanged ?? '')
    .split(/[;,]/)
    .map((t) => normalizeHeader(t))
    .filter(Boolean);
  const matched = new Set<string>();
  if (tokens.length === 0) return matched;
  for (const key of keys) {
    const col = ALL_COLUMNS[key];
    if (!col) continue;
    if (tokens.includes(normalizeHeader(col.label)) || tokens.includes(normalizeHeader(key))) {
      matched.add(key);
    }
  }
  return matched;
}
