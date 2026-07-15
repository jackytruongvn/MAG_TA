import type { ColumnDef } from '@/lib/columns';
import type { RowData } from '@/types';
import { isValidDateInput } from '@/lib/dates';
import { firstInvalidEmail, isValidEmail } from '@/lib/utils';

/**
 * Validate one entry row. Returns { fieldKey: errorMessage } — empty object
 * when the row is valid. Shared by client (red cell highlighting) and server
 * (submit gate) so the rules can never drift apart.
 */
export function validateRow(row: RowData, columns: ColumnDef[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const has = (k: string) => (row[k] ?? '').trim() !== '';

  for (const col of columns) {
    const value = (row[col.key] ?? '').trim();

    if (col.required && !value) {
      errors[col.key] = `${col.label} is required`;
      continue;
    }
    if (!value) continue;

    switch (col.type) {
      case 'date':
        if (!isValidDateInput(value)) {
          errors[col.key] = `Invalid date (accepted: dd/MM/yyyy, d/M/yyyy, dd-MMM-yyyy, yyyy-MM-dd)`;
        }
        break;
      case 'email':
        if (!isValidEmail(value)) errors[col.key] = `Invalid email format`;
        break;
      case 'emails': {
        const bad = firstInvalidEmail(value);
        if (bad) errors[col.key] = `Invalid email: ${bad}`;
        break;
      }
    }
  }

  // Cross-field rules
  const workEmail = (row.workEmail ?? '').trim();
  if (workEmail && !['Yes', 'No'].includes(workEmail)) {
    errors.workEmail = 'Work Email must be Yes, No or blank';
  }
  if (workEmail === 'Yes' && !has('division')) {
    errors.division = 'Division is required when Work Email = Yes';
  }

  const priority = (row.priority ?? '').trim();
  if (priority && !['Normal', 'Urgent'].includes(priority)) {
    errors.priority = 'Priority must be Normal or Urgent';
  }

  return errors;
}

/** Validate all rows; returns map rowIndex -> field errors (only invalid rows). */
export function validateRows(rows: RowData[], columns: ColumnDef[]): Record<number, Record<string, string>> {
  const all: Record<number, Record<string, string>> = {};
  rows.forEach((row, i) => {
    const e = validateRow(row, columns);
    if (Object.keys(e).length > 0) all[i] = e;
  });
  return all;
}
