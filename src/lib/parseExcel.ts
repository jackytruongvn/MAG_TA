import type { ColumnDef } from '@/lib/columns';
import type { RowData } from '@/types';
import { normalizeHeader } from '@/lib/utils';
import { parseDateOnly } from '@/lib/dates';

/**
 * Parse raw clipboard text copied from Excel into a 2D string matrix.
 * Handles tab-separated cells, \r\n / \n rows, and Excel's quoting rules for
 * cells that contain newlines or tabs ("..." with "" as an escaped quote).
 * Vietnamese text is preserved as-is.
 */
export function parseClipboard(text: string): string[][] {
  if (!text) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => { pushCell(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { inQuotes = true; i++; continue; }
    if (ch === '\t') { pushCell(); i++; continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; pushRow(); i++; continue; }
    if (ch === '\n') { pushRow(); i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length > 0) pushRow();

  // Drop fully-empty trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  return rows;
}

/**
 * If `firstRow` looks like a header row, return the column-key mapping for
 * each cell (null for unrecognized headers). Otherwise return null.
 * A row is considered a header when >= 3 cells (or >= 60% of non-empty cells)
 * match a known column alias.
 */
export function detectHeaderMapping(firstRow: string[], columns: ColumnDef[]): (string | null)[] | null {
  const aliasToKey = new Map<string, string>();
  for (const col of columns) {
    aliasToKey.set(normalizeHeader(col.label), col.key);
    for (const a of col.aliases) aliasToKey.set(a, col.key);
  }
  const mapping = firstRow.map((cell) => aliasToKey.get(normalizeHeader(cell)) ?? null);
  const nonEmpty = firstRow.filter((c) => c.trim() !== '').length;
  const matched = mapping.filter(Boolean).length;
  if (matched >= 3 || (nonEmpty > 0 && matched / nonEmpty >= 0.6 && matched >= 2)) return mapping;
  return null;
}

export interface PasteResult {
  rows: RowData[];
  headerDetected: boolean;
  rowCount: number;
}

/**
 * Convert pasted Excel text into RowData objects mapped onto `columns`.
 * - Auto-detects a header row (mapped by header name); otherwise maps cells
 *   by the standard column order.
 * - Normalizes date columns to ISO yyyy-MM-dd when parseable (invalid values
 *   are kept as-is so validation can flag the exact cell).
 * - Normalizes Priority / Work Email casing.
 */
export function pasteToRows(text: string, columns: ColumnDef[]): PasteResult {
  const matrix = parseClipboard(text);
  if (matrix.length === 0) return { rows: [], headerDetected: false, rowCount: 0 };

  const headerMapping = detectHeaderMapping(matrix[0], columns);
  const dataRows = headerMapping ? matrix.slice(1) : matrix;

  const rows: RowData[] = dataRows
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const row: RowData = {};
      if (headerMapping) {
        cells.forEach((value, idx) => {
          const key = headerMapping[idx];
          if (key) row[key] = value.trim();
        });
      } else {
        columns.forEach((col, idx) => {
          row[col.key] = (cells[idx] ?? '').trim();
        });
      }
      return normalizeRowValues(row, columns);
    });

  return { rows, headerDetected: headerMapping !== null, rowCount: rows.length };
}

/** Normalize date / select values inside one row (keeps invalid input untouched). */
export function normalizeRowValues(row: RowData, columns: ColumnDef[]): RowData {
  const out = { ...row };
  for (const col of columns) {
    const v = out[col.key];
    if (v === undefined || v === '') continue;
    if (col.type === 'date') {
      const iso = parseDateOnly(v);
      if (iso) out[col.key] = iso;
    } else if (col.key === 'priority') {
      const p = v.trim().toLowerCase();
      if (p === 'urgent') out[col.key] = 'Urgent';
      else if (p === 'normal') out[col.key] = 'Normal';
    } else if (col.key === 'workEmail') {
      const w = v.trim().toLowerCase();
      if (w === 'yes' || w === 'y') out[col.key] = 'Yes';
      else if (w === 'no' || w === 'n') out[col.key] = 'No';
    }
  }
  return out;
}

/** Build an empty row with all column keys present. */
export function emptyRow(columns: ColumnDef[]): RowData {
  const row: RowData = {};
  for (const col of columns) row[col.key] = col.key === 'priority' ? 'Normal' : '';
  return row;
}
