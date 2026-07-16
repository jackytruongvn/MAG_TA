import type { AppConfigShape, EmailPreview, RequestType, RowData } from '@/types';
import { ALL_COLUMNS, EMAIL_TABLE_COLUMNS, parseChangedFieldKeys } from '@/lib/columns';
import { escapeHtml, splitEmails, uniqueEmails, maskDob, maskPhone } from '@/lib/utils';
import { formatDateOnly } from '@/lib/dates';

const CHANGED_FIELD_STYLE = 'color:#c0392b;font-weight:700;';

/** Replace {{Placeholder}} tokens (case-insensitive) in a template string. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name: string) => {
    const key = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
    return key !== undefined ? vars[key] : '';
  });
}

function cellDisplay(key: string, value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  // DOB and Phone Number are masked in outgoing emails too, not just the dashboard UI
  if (key === 'dob') return maskDob(v);
  if (key === 'phoneNumber') return maskPhone(v);
  if (ALL_COLUMNS[key]?.type === 'date') return formatDateOnly(v) || v;
  return v;
}

/**
 * Explicit per-column pixel width. Email clients (Outlook/Word engine, Gmail's
 * own layout pass, etc.) routinely squeeze `table-layout:auto` columns down
 * to fit a constrained viewport regardless of `nowrap`, ignoring the natural
 * content width. Giving each column a concrete width (both the legacy HTML
 * `width` attribute and a CSS min-width) is the standard email-safe fix —
 * reuses the same width already tuned for the entry grid.
 */
function columnWidthPx(key: string): number {
  return ALL_COLUMNS[key]?.width ?? 120;
}

/** Render the {{RowsTable}} HTML table for a request type. */
export function buildRowsTableHtml(type: RequestType, rows: RowData[]): string {
  const keys = EMAIL_TABLE_COLUMNS[type];
  // `white-space:nowrap` alone is unreliable in Outlook's Word rendering engine,
  // which causes headers/cells to wrap mid-word regardless of the CSS. The legacy
  // HTML `nowrap` attribute is the standard Outlook-safe workaround alongside it.
  const th = keys
    .map((k) => {
      const w = columnWidthPx(k);
      return `<th nowrap="nowrap" width="${w}" style="border:1px solid #999;padding:4px 8px;background:#8b5e34;color:#fff;white-space:nowrap;font-size:12px;min-width:${w}px;">${escapeHtml(ALL_COLUMNS[k].label)}</th>`;
    })
    .join('');
  const trs = rows
    .map((row) => {
      // For Update requests, highlight exactly the columns listed in "Fields
      // Changed" instead of needing separate Previous/New Value columns.
      const changedKeys = type === 'UPDATE' ? parseChangedFieldKeys(row.fieldsChanged, keys) : new Set<string>();
      const tds = keys
        .map((k) => {
          const w = columnWidthPx(k);
          const style = changedKeys.has(k)
            ? `border:1px solid #999;padding:4px 8px;font-size:12px;white-space:nowrap;min-width:${w}px;${CHANGED_FIELD_STYLE}`
            : `border:1px solid #999;padding:4px 8px;font-size:12px;white-space:nowrap;min-width:${w}px;`;
          return `<td nowrap="nowrap" width="${w}" style="${style}">${escapeHtml(cellDisplay(k, row[k]))}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;table-layout:auto;font-family:Segoe UI,Arial,sans-serif;">${'<thead><tr>' + th + '</tr></thead>'}<tbody>${trs}</tbody></table>`;
}

function joinUnique(rows: RowData[], key: string, fmt?: (v: string) => string): string {
  const vals = uniqueEmails(rows.map((r) => (r[key] ?? '').trim()).filter(Boolean));
  return vals.map((v) => (fmt ? fmt(v) : v)).join(', ');
}

/** Build the final email (subject/to/cc/html) for a group of rows of one type. */
export function buildEmail(
  type: RequestType,
  rows: RowData[],
  config: AppConfigShape,
  submittedByEmail: string,
): EmailPreview {
  const tpl = config.templates[type];
  const first = rows[0] ?? {};

  const vars: Record<string, string> = {
    StartingDate: joinUnique(rows, 'startingDate', (v) => formatDateOnly(v) || v) || formatDateOnly(first.startingDate ?? ''),
    OfficeLocation: joinUnique(rows, 'officeLocation') || (first.officeLocation ?? ''),
    FullName: joinUnique(rows, 'fullName'),
    Division: joinUnique(rows, 'division'),
    LineManagerEmail: joinUnique(rows, 'lineManagerEmail'),
    SubmittedByEmail: escapeHtml(submittedByEmail),
    UpdateReason: escapeHtml(rows.map((r) => (r.updateReason ?? '').trim()).filter(Boolean).join('; ')),
    CancelReason: escapeHtml(rows.map((r) => (r.cancelReason ?? '').trim()).filter(Boolean).join('; ')),
    RowsTable: buildRowsTableHtml(type, rows),
  };

  const subject = renderTemplate(tpl.subject, {
    ...vars,
    // subject must stay plain text
    RowsTable: '',
    SubmittedByEmail: submittedByEmail,
  }).trim();

  const html = renderTemplate(tpl.body, vars);

  const to = uniqueEmails(config.emailSettings.defaultTo);
  const cc = uniqueEmails(rows.flatMap((r) => splitEmails(r.cc)));

  return { subject, to, cc, html };
}
