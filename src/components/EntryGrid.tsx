'use client';

/**
 * Spreadsheet-like entry grid optimized for pasting from Excel:
 * - "Paste Excel data here" zone: splits tabs/newlines, auto-detects header
 *   row, maps by header or by standard column order.
 * - Pasting inside a cell with multi-cell data expands from that position.
 * - Cell-level validation errors shown in red with tooltip.
 * - Date cells: free text (dd/MM/yyyy, d/M/yyyy, dd-MMM-yyyy, yyyy-MM-dd)
 *   plus native date picker button. Values normalized without timezone shift.
 * - Cc auto-fills from Line Manager email (config-controlled) but stays editable.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDef } from '@/lib/columns';
import type { RowData } from '@/types';
import { pasteToRows, parseClipboard, emptyRow, normalizeRowValues } from '@/lib/parseExcel';
import { parseDateOnly, formatDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * "Fields Changed" picker: a button showing the selected field names, opening
 * a checkbox dropdown rendered via portal so it isn't clipped by the grid's
 * scroll container.
 */
function MultiSelectCell({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = new Set(
    value.split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  const openPanel = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (label: string) => {
    const key = label.toLowerCase();
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(options.filter((o) => next.has(o.label.toLowerCase())).map((o) => o.label).join(', '));
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="cell-input flex h-8 w-full items-center justify-between gap-1 text-left"
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className="truncate">
          {value || <span className="text-slate-400">Select fields…</span>}
        </span>
        <span className="shrink-0 text-slate-400">▾</span>
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
              style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
            >
              {options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(o.label.toLowerCase())}
                    onChange={() => toggle(o.label)}
                  />
                  {o.label}
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export interface EntryGridProps {
  columns: ColumnDef[];
  rows: RowData[];
  onRowsChange: (rows: RowData[]) => void;
  errors: Record<number, Record<string, string>>;
  selected: Set<number>;
  onSelectedChange: (s: Set<number>) => void;
  autoFillCc: boolean;
  allowCcEdit: boolean;
  onPasteInfo?: (count: number, headerDetected: boolean) => void;
}

export function EntryGrid({
  columns, rows, onRowsChange, errors, selected, onSelectedChange,
  autoFillCc, allowCcEdit, onPasteInfo,
}: EntryGridProps) {
  const [pasteZoneActive, setPasteZoneActive] = useState(false);
  const dateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const applyCcAutofill = (row: RowData, prevManagerEmail?: string): RowData => {
    if (!autoFillCc) return row;
    const cc = (row.cc ?? '').trim();
    const mgr = (row.lineManagerEmail ?? '').trim();
    // fill when empty, or follow the manager email if cc was exactly the old value
    if (mgr && (cc === '' || (prevManagerEmail !== undefined && cc === prevManagerEmail))) {
      return { ...row, cc: mgr };
    }
    return row;
  };

  const setCell = (rowIdx: number, key: string, value: string) => {
    const next = [...rows];
    const prevManager = next[rowIdx].lineManagerEmail ?? '';
    let row = { ...next[rowIdx], [key]: value };
    if (key === 'lineManagerEmail') row = applyCcAutofill(row, prevManager);
    next[rowIdx] = row;
    onRowsChange(next);
  };

  const handleZonePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const result = pasteToRows(text, columns);
    if (result.rows.length === 0) return;
    const withCc = result.rows.map((r) => applyCcAutofill(r));
    onRowsChange([...rows.filter((r) => Object.values(r).some((v) => v?.trim())), ...withCc]);
    onPasteInfo?.(result.rowCount, result.headerDetected);
    setPasteZoneActive(false);
  };

  /** Paste inside a cell: multi-cell clipboard expands right/down from that cell. */
  const handleCellPaste = (e: React.ClipboardEvent, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // single value -> default input paste
    e.preventDefault();
    const matrix = parseClipboard(text);
    const next = [...rows];
    matrix.forEach((cells, r) => {
      const target = rowIdx + r;
      while (next.length <= target) next.push(emptyRow(columns));
      let row = { ...next[target] };
      const prevManager = row.lineManagerEmail ?? '';
      cells.forEach((value, c) => {
        const col = columns[colIdx + c];
        if (col) row[col.key] = value.trim();
      });
      row = normalizeRowValues(row, columns);
      row = applyCcAutofill(row, prevManager);
      next[target] = row;
    });
    onRowsChange(next);
    onPasteInfo?.(matrix.length, false);
  };

  const toggleAll = (checked: boolean) => {
    onSelectedChange(checked ? new Set(rows.map((_, i) => i)) : new Set());
  };
  const toggleRow = (i: number, checked: boolean) => {
    const s = new Set(selected);
    if (checked) s.add(i); else s.delete(i);
    onSelectedChange(s);
  };

  const renderCell = (row: RowData, rowIdx: number, col: ColumnDef, colIdx: number) => {
    const value = row[col.key] ?? '';
    const error = errors[rowIdx]?.[col.key];
    const disabled = col.key === 'cc' && !allowCcEdit;

    const base = (
      <div className={cn('relative h-8', error && 'bg-red-50')} title={error}>
        {col.type === 'select' ? (
          <select
            className={cn('cell-input appearance-none', error && 'text-red-700')}
            value={value}
            onChange={(e) => setCell(rowIdx, col.key, e.target.value)}
          >
            {(col.options ?? []).map((o) => (
              <option key={o} value={o}>{o === '' ? '—' : o}</option>
            ))}
          </select>
        ) : col.type === 'multiselect' ? (
          <MultiSelectCell
            value={value}
            options={col.multiOptions ?? []}
            onChange={(v) => setCell(rowIdx, col.key, v)}
          />
        ) : col.type === 'date' ? (
          <div className="flex h-8 items-center">
            <input
              className={cn('cell-input', error && 'text-red-700')}
              value={value.match(/^\d{4}-\d{2}-\d{2}$/) ? formatDateOnly(value) : value}
              placeholder="dd/MM/yyyy"
              onChange={(e) => setCell(rowIdx, col.key, e.target.value)}
              onBlur={(e) => {
                const iso = parseDateOnly(e.target.value);
                if (iso) setCell(rowIdx, col.key, iso);
              }}
              onPaste={(e) => handleCellPaste(e, rowIdx, colIdx)}
            />
            <input
              ref={(el) => { dateInputRefs.current[`${rowIdx}:${col.key}`] = el; }}
              type="date"
              className="absolute h-0 w-0 opacity-0"
              tabIndex={-1}
              value={value.match(/^\d{4}-\d{2}-\d{2}$/) ? value : ''}
              onChange={(e) => setCell(rowIdx, col.key, e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              className="px-1 text-slate-400 hover:text-brand-600"
              title="Open date picker"
              onClick={() => {
                const el = dateInputRefs.current[`${rowIdx}:${col.key}`];
                el?.showPicker?.();
              }}
            >
              📅
            </button>
          </div>
        ) : (
          <input
            className={cn('cell-input', error && 'text-red-700', disabled && 'cursor-not-allowed text-slate-400')}
            value={value}
            disabled={disabled}
            onChange={(e) => setCell(rowIdx, col.key, e.target.value)}
            onBlur={
              col.type === 'emails' || col.type === 'email'
                ? (e) => setCell(rowIdx, col.key, e.target.value.trim())
                : col.key === 'workEmail'
                  ? (e) => {
                      const w = e.target.value.trim().toLowerCase();
                      if (w === 'yes' || w === 'y') setCell(rowIdx, col.key, 'Yes');
                      else if (w === 'no' || w === 'n') setCell(rowIdx, col.key, 'No');
                    }
                  : undefined
            }
            onPaste={(e) => handleCellPaste(e, rowIdx, colIdx)}
            inputMode={col.key === 'phoneNumber' ? 'text' : undefined}
          />
        )}
        {error && (
          <div className="pointer-events-none absolute inset-0 border-2 border-red-400" />
        )}
      </div>
    );
    return base;
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex min-h-[64px] cursor-text items-center justify-center rounded-lg border-2 border-dashed p-4 text-sm transition-colors',
          pasteZoneActive
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-slate-300 bg-white text-slate-500 hover:border-brand-400',
        )}
        tabIndex={0}
        onFocus={() => setPasteZoneActive(true)}
        onBlur={() => setPasteZoneActive(false)}
        onPaste={handleZonePaste}
      >
        📋 Click here, then <b className="mx-1">Ctrl+V</b> to paste Excel data (multiple rows supported —
        header row is auto-detected; Vietnamese text and dates are preserved)
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: '55vh' }}>
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="th-grid sticky left-0 z-20 w-10 bg-slate-50 text-center">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="th-grid w-10 text-center">#</th>
              {columns.map((col) => (
                <th key={col.key} className="th-grid" style={{ minWidth: col.width }}>
                  {col.label}
                  {col.required && <span className="ml-0.5 text-red-500">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={cn(selected.has(rowIdx) && 'bg-brand-50/50')}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(rowIdx)}
                    onChange={(e) => toggleRow(rowIdx, e.target.checked)}
                  />
                </td>
                <td className="border-b border-r border-slate-100 text-center text-xs text-slate-400">
                  {rowIdx + 1}
                </td>
                {columns.map((col, colIdx) => (
                  <td key={col.key} className="border-b border-r border-slate-100 p-0" style={{ minWidth: col.width }}>
                    {renderCell(row, rowIdx, col, colIdx)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-sm text-slate-400">
                  No rows yet — paste from Excel above or click “Add row”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
