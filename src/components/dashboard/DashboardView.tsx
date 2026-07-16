'use client';

/**
 * Dashboard: summary cards, quick filters, and the full data grid
 * (search / filter / sort / hide columns / export / bulk actions /
 * retry / resend / email preview / audit log / sensitive masking).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { EmailPreviewModal } from '@/components/EmailPreviewModal';
import { AuditLogModal } from '@/components/dashboard/AuditLogModal';
import { BulkEditModal } from '@/components/dashboard/BulkEditModal';
import type { RequestRecord } from '@/components/dashboard/types';
import type { EmailPreview, RowData } from '@/types';
import { formatDateOnly } from '@/lib/dates';
import { cn, maskDob, maskPhone, isValidEmail } from '@/lib/utils';

/**
 * Common identifying fields carried over when prefilling an Update or
 * Cancelled request from an existing row — including `accountEmail` so the
 * real account IT created (once recorded via the Account column) flows into
 * whichever follow-up request the TA creates next, instead of being lost.
 */
const PREFILL_FIELDS = [
  'salutation', 'fullName', 'dob', 'positionEng', 'positionVie', 'jobLevel', 'division',
  'departmentEng', 'departmentVie', 'functionEng', 'functionVie', 'startingDate', 'location',
  'officeLocation', 'project', 'lineManager', 'lineManagerEmail', 'workEmail', 'accountEmail', 'phoneNumber',
  'company', 'lienQuan', 'cc', 'notes',
] as const;

function recordToPrefillRow(r: RequestRecord): RowData {
  const row: RowData = { priority: 'Normal' };
  for (const f of PREFILL_FIELDS) row[f] = ((r as unknown as Record<string, string | null>)[f]) ?? '';
  return row;
}

const QUICK_FILTERS = ['All', 'Pending', 'Scheduled', 'Sent', 'Failed', 'Urgent', 'Create', 'Update', 'Cancelled'] as const;

interface Summary {
  totalToday: number;
  pendingSchedule: number;
  sentToday: number;
  failed: number;
  urgentSentToday: number;
  createdByMe: number;
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-200 text-slate-600',
  PENDING: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-300 text-slate-700',
};

const col = createColumnHelper<RequestRecord>();

/** Inline "account created by IT" cell: text input + its own Save button, per row. */
function AccountCell({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const lastSynced = useRef(initialValue);

  useEffect(() => {
    // Only auto-sync from the server value if the user hasn't started typing
    // something else locally — avoids a background table reload (e.g. another
    // action refreshing the grid) silently wiping an in-progress edit.
    setValue((current) => (current === lastSynced.current ? initialValue : current));
    lastSynced.current = initialValue;
  }, [initialValue]);

  return (
    <div className="flex items-center gap-1">
      <input
        className="input h-7 w-40 text-xs"
        placeholder="account@masterisegroup.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="btn-outline btn-sm"
        disabled={saving || value.trim() === (initialValue ?? '')}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(value.trim());
          } finally {
            setSaving(false);
          }
        }}
      >
        💾
      </button>
    </div>
  );
}

export function DashboardView() {
  const { toast } = useToast();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [data, setData] = useState<RequestRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quick, setQuick] = useState<(typeof QUICK_FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [showSensitive, setShowSensitive] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    dob: false, positionVie: false, departmentVie: false, functionEng: false, functionVie: false,
    jobLevel: false, project: false, lienQuan: false, notes: false, salutation: false,
    phoneNumber: false, updatedByEmail: false, submittedByEmail: false,
  });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [colFilters, setColFilters] = useState({
    type: 'All', status: 'All', priority: 'All', location: '', officeLocation: '', company: '', createdBy: '', from: '', to: '',
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resendIds, setResendIds] = useState<string[] | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (quick === 'Pending') params.set('status', 'PENDING');
    else if (quick === 'Scheduled') params.set('status', 'SCHEDULED');
    else if (quick === 'Sent') params.set('status', 'SENT');
    else if (quick === 'Failed') params.set('status', 'FAILED');
    else if (quick === 'Urgent') params.set('priority', 'URGENT');
    else if (quick === 'Create') params.set('type', 'CREATE');
    else if (quick === 'Update') params.set('type', 'UPDATE');
    else if (quick === 'Cancelled') params.set('type', 'CANCELLED');
    if (colFilters.type !== 'All') params.set('type', colFilters.type);
    if (colFilters.status !== 'All') params.set('status', colFilters.status);
    if (colFilters.priority !== 'All') params.set('priority', colFilters.priority);
    if (colFilters.createdBy) params.set('createdBy', colFilters.createdBy);
    if (colFilters.from) params.set('from', colFilters.from);
    if (colFilters.to) params.set('to', colFilters.to);

    const [reqRes, sumRes] = await Promise.all([
      fetch(`/api/requests?${params}`),
      fetch('/api/dashboard/summary'),
    ]);
    if (reqRes.ok) setData((await reqRes.json()).requests);
    if (sumRes.ok) setSummary(await sumRes.json());
  }, [quick, colFilters]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fmtDt = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '');

  const columns = useMemo(
    () => [
      col.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
        ),
        size: 32,
      }),
      col.accessor('requestType', {
        header: 'Type',
        cell: (c) => (
          <span
            className={cn(
              'badge',
              c.getValue() === 'CREATE' && 'bg-emerald-100 text-emerald-700',
              c.getValue() === 'UPDATE' && 'bg-blue-100 text-blue-700',
              c.getValue() === 'CANCELLED' && 'bg-slate-300 text-slate-700',
            )}
          >
            {c.getValue()}
          </span>
        ),
      }),
      col.accessor('status', {
        header: 'Status',
        cell: (c) => <span className={cn('badge', STATUS_BADGE[c.getValue()] ?? 'bg-slate-100')}>{c.getValue()}</span>,
      }),
      col.accessor('priority', {
        header: 'Priority',
        cell: (c) =>
          c.getValue() === 'URGENT' ? (
            <span className="badge bg-red-100 text-red-700">⚡ URGENT</span>
          ) : (
            <span className="badge bg-slate-100 text-slate-600">Normal</span>
          ),
      }),
      col.accessor('salutation', { header: 'Salutation' }),
      col.accessor('fullName', { header: 'Full name', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
      col.accessor('dob', { header: 'DOB', cell: (c) => (showSensitive ? formatDateOnly(c.getValue()) : maskDob(c.getValue())) }),
      col.accessor('positionEng', { header: 'Position_ENG' }),
      col.accessor('positionVie', { header: 'Position_VIE' }),
      col.accessor('jobLevel', { header: 'Job Level' }),
      col.accessor('division', { header: 'Division' }),
      col.accessor('departmentEng', { header: 'Department_ENG' }),
      col.accessor('departmentVie', { header: 'Department_VIE' }),
      col.accessor('functionEng', { header: 'Function_ENG' }),
      col.accessor('functionVie', { header: 'Function_VIE' }),
      col.accessor('startingDate', { header: 'Starting Date', cell: (c) => formatDateOnly(c.getValue()) }),
      col.accessor('location', { header: 'Location' }),
      col.accessor('officeLocation', { header: 'Office Location' }),
      col.accessor('project', { header: 'Project' }),
      col.accessor('lineManager', { header: 'Line Manager' }),
      col.accessor('lineManagerEmail', { header: 'LM Email' }),
      col.accessor('workEmail', { header: 'Work Email' }),
      col.accessor('accountEmail', {
        header: 'Account',
        size: 200,
        cell: (c) => (
          <AccountCell
            initialValue={c.getValue() ?? ''}
            onSave={(value) => saveAccountEmail(c.row.original.id, value)}
          />
        ),
      }),
      col.accessor('phoneNumber', { header: 'Phone', cell: (c) => (showSensitive ? c.getValue() : maskPhone(c.getValue())) }),
      col.accessor('company', { header: 'Company' }),
      col.accessor('lienQuan', { header: 'Liên quân' }),
      col.accessor('cc', { header: 'Cc' }),
      col.accessor('notes', { header: 'Notes' }),
      col.accessor('scheduledSendAt', { header: 'Scheduled At', cell: (c) => fmtDt(c.getValue()) }),
      col.accessor('sentAt', { header: 'Sent At', cell: (c) => fmtDt(c.getValue()) }),
      col.accessor('sendError', {
        header: 'Send Error',
        cell: (c) => <span className="text-xs text-red-600">{c.getValue()?.slice(0, 80)}</span>,
      }),
      col.accessor('createdByEmail', { header: 'Created By' }),
      col.accessor('updatedByEmail', { header: 'Updated By' }),
      col.accessor('submittedByEmail', { header: 'Submitted By' }),
      col.accessor('createdAt', { header: 'Created At', cell: (c) => fmtDt(c.getValue()) }),
      col.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-1">
            <button className="btn-outline btn-sm" title="Email preview" onClick={() => void showPreview(row.original)}>
              👁
            </button>
            <button className="btn-outline btn-sm" title="Audit log" onClick={() => setAuditId(row.original.id)}>
              📜
            </button>
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showSensitive],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection, globalFilter: search },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (r) => r.id,
    globalFilterFn: (row, _id, value) => {
      const v = String(value).toLowerCase();
      return Object.values(row.original).some((x) => x != null && String(x).toLowerCase().includes(v));
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  function createFromSelection(type: 'UPDATE' | 'CANCELLED') {
    const selectedRecords = data.filter((r) => selectedIds.includes(r.id));
    if (selectedRecords.length === 0) return;
    const rows = selectedRecords.map(recordToPrefillRow);
    sessionStorage.setItem(`prefillRows_${type}`, JSON.stringify(rows));
    router.push(type === 'UPDATE' ? '/update' : '/cancelled');
  }

  async function saveAccountEmail(id: string, value: string) {
    if (value && !isValidEmail(value)) {
      toast('error', 'Invalid account email format');
      return;
    }
    const res = await fetch(`/api/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountEmail: value }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast('error', d.error ?? 'Save failed');
      return;
    }
    toast('success', 'Account saved');
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, accountEmail: d.accountEmail } : r)));
  }

  async function showPreview(r: RequestRecord) {
    setPreviewOpen(true);
    setPreview(null);
    if (r.emailSubject && r.emailBodyHtml) {
      setPreview({
        subject: r.emailSubject,
        to: [], cc: (r.cc ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
        html: r.emailBodyHtml,
      });
      return;
    }
    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: r.requestType,
        rows: [Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))],
      }),
    });
    if (res.ok) setPreview(await res.json());
    else { setPreviewOpen(false); toast('error', 'Preview failed'); }
  }

  const callBulkApi = async (url: string, body: unknown, okMsg: (d: any) => string, method: 'POST' | 'DELETE' = 'POST') => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.status === 409 && d.alreadySentIds) {
        setResendIds(selectedIds);
        return;
      }
      if (!res.ok) { toast('error', d.error ?? 'Action failed'); return; }
      toast('success', okMsg(d));
      setRowSelection({});
      await load();
    } finally {
      setBusy(false);
    }
  };

  const exportRows = (kind: 'csv' | 'xlsx') => {
    const visible = table.getVisibleLeafColumns().filter((c) => !['select', 'actions'].includes(c.id));
    const rows = table.getSortedRowModel().rows.map((r) => r.original);
    const header = visible.map((c) => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const body = rows.map((rec) =>
      visible.map((c) => {
        const v = (rec as unknown as Record<string, unknown>)[c.id];
        if (c.id === 'dob' || c.id === 'startingDate') return formatDateOnly(v as string);
        if (c.id === 'createdAt' || c.id === 'sentAt' || c.id === 'scheduledSendAt') return fmtDt(v as string);
        return v == null ? '' : String(v);
      }),
    );

    if (kind === 'csv') {
      const csv = [header, ...body]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
      // BOM so Excel opens Vietnamese text correctly
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `onboarding-requests-${Date.now()}.csv`);
    } else {
      void import('xlsx').then((XLSX) => {
        const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Requests');
        XLSX.writeFile(wb, `onboarding-requests-${Date.now()}.xlsx`);
      });
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards: Array<[string, number | undefined, string]> = [
    ['Total requests today', summary?.totalToday, 'text-slate-800'],
    ['Pending schedule', summary?.pendingSchedule, 'text-amber-600'],
    ['Sent today', summary?.sentToday, 'text-emerald-600'],
    ['Failed', summary?.failed, 'text-red-600'],
    ['Urgent sent today', summary?.urgentSentToday, 'text-purple-600'],
    ['Created by me', summary?.createdByMe, 'text-brand-600'],
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Dashboard</h2>
          <div className="flex gap-2">
            <Link href="/create" className="btn-primary btn-sm">🆕 Create</Link>
            <Link href="/update" className="btn-outline btn-sm">✏️ Update</Link>
            <Link href="/cancelled" className="btn-outline btn-sm">🚫 Cancelled</Link>
            <Link href="/config" className="btn-outline btn-sm">⚙️ Config</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(([label, value, color]) => (
            <div key={label} className="card">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className={cn('mt-1 text-2xl font-bold', color)}>{value ?? '–'}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                quick === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50',
              )}
              onClick={() => setQuick(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <label className="label">Global search</label>
              <input className="input" placeholder="Search all columns…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <label className="label">Action Type</label>
              <select className="input" value={colFilters.type} onChange={(e) => setColFilters({ ...colFilters, type: e.target.value })}>
                {['All', 'CREATE', 'UPDATE', 'CANCELLED'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={colFilters.status} onChange={(e) => setColFilters({ ...colFilters, status: e.target.value })}>
                {['All', 'DRAFT', 'PENDING', 'SCHEDULED', 'SENT', 'FAILED', 'CANCELLED'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={colFilters.priority} onChange={(e) => setColFilters({ ...colFilters, priority: e.target.value })}>
                {['All', 'NORMAL', 'URGENT'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start date from</label>
              <input type="date" className="input" value={colFilters.from} onChange={(e) => setColFilters({ ...colFilters, from: e.target.value })} />
            </div>
            <div>
              <label className="label">to</label>
              <input type="date" className="input" value={colFilters.to} onChange={(e) => setColFilters({ ...colFilters, to: e.target.value })} />
            </div>
            <div className="w-44">
              <label className="label">Created by</label>
              <input className="input" placeholder="email…" value={colFilters.createdBy} onChange={(e) => setColFilters({ ...colFilters, createdBy: e.target.value })} />
            </div>
            <div className="ml-auto flex gap-2">
              <button className="btn-outline btn-sm" onClick={() => setShowSensitive(!showSensitive)}>
                {showSensitive ? '🙈 Hide sensitive' : '👁 Show sensitive'}
              </button>
              <div className="relative" ref={colMenuRef}>
                <button className="btn-outline btn-sm" onClick={() => setColMenuOpen(!colMenuOpen)}>🧩 Columns</button>
                {colMenuOpen && (
                  <div className="absolute right-0 z-40 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                    {table.getAllLeafColumns()
                      .filter((c) => !['select', 'actions'].includes(c.id))
                      .map((c) => (
                        <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                          <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                          {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                        </label>
                      ))}
                  </div>
                )}
              </div>
              <button className="btn-outline btn-sm" onClick={() => exportRows('csv')}>⬇ CSV</button>
              <button className="btn-outline btn-sm" onClick={() => exportRows('xlsx')}>⬇ XLSX</button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2">
              <span className="text-sm font-medium text-brand-700">{selectedIds.length} selected</span>
              <button className="btn-outline btn-sm" onClick={() => setBulkEditOpen(true)}>✏️ Bulk edit</button>
              <button
                className="btn-outline btn-sm"
                title="Prefill the Update page with this row's data"
                onClick={() => createFromSelection('UPDATE')}
              >
                📝 Create Update
              </button>
              <button
                className="btn-outline btn-sm"
                title="Prefill the Cancelled page with this row's data"
                onClick={() => createFromSelection('CANCELLED')}
              >
                🚫 Create Cancelled
              </button>
              <button
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => callBulkApi('/api/requests/submit', { ids: selectedIds }, (d) => `Submitted — status ${d.status}`)}
              >
                📤 Submit / Schedule
              </button>
              <button
                className="btn-danger btn-sm"
                disabled={busy}
                onClick={() => callBulkApi('/api/requests/send-urgent', { ids: selectedIds }, (d) => `Sent ${d.sent.length}, failed ${d.failed.length}`)}
              >
                ⚡ Send now
              </button>
              <button
                className="btn-warn btn-sm"
                disabled={busy}
                onClick={() => callBulkApi('/api/requests/retry', { ids: selectedIds }, (d) => `Retried: ${d.sent.length} sent, ${d.failed.length} failed`)}
              >
                🔄 Retry failed
              </button>
              {isAdmin && (
                <button className="btn-danger btn-sm" disabled={busy} onClick={() => setDeleteConfirmOpen(true)}>
                  🗑 Delete
                </button>
              )}
            </div>
          )}

          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="th-grid cursor-pointer select-none"
                        onClick={h.column.getToggleSortingHandler()}
                        style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {{ asc: '▲', desc: '▼' }[h.column.getIsSorted() as string] ?? ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={cn('hover:bg-slate-50', row.getIsSelected() && 'bg-brand-50/60')}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={99} className="px-4 py-10 text-center text-slate-400">No requests found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-400">{table.getRowModel().rows.length} row(s)</div>
        </div>
      </div>

      <BulkEditModal
        open={bulkEditOpen}
        count={selectedIds.length}
        onClose={() => setBulkEditOpen(false)}
        onApply={async (fields) => {
          const res = await fetch('/api/requests/bulk', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds, fields }),
          });
          const d = await res.json();
          if (res.ok) {
            toast('success', `Updated ${d.updated} row(s), skipped ${d.skipped} (already sent)`);
            setBulkEditOpen(false);
            setRowSelection({});
            await load();
          } else {
            toast('error', d.error ?? 'Bulk edit failed');
          }
        }}
      />

      <AuditLogModal requestId={auditId} onClose={() => setAuditId(null)} />
      <EmailPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} preview={preview} />

      <Modal
        open={resendIds !== null}
        onClose={() => setResendIds(null)}
        title="Confirm Resend"
        footer={
          <>
            <button className="btn-outline" onClick={() => setResendIds(null)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                const ids = resendIds!;
                setResendIds(null);
                await callBulkApi('/api/requests/send-urgent', { ids, resend: true }, (d) => `Resent ${d.sent.length}, failed ${d.failed.length}`);
              }}
            >
              Resend anyway
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Some selected requests were <b>already sent</b>. Sending again will deliver a duplicate email to the
          recipients. Are you sure you want to resend?
        </p>
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Confirm Delete"
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={async () => {
                setDeleteConfirmOpen(false);
                await callBulkApi(
                  '/api/requests/bulk',
                  { ids: selectedIds },
                  (d) => `Deleted ${d.deleted} row(s)` + (d.blocked ? `, ${d.blocked} already-sent row(s) protected` : ''),
                  'DELETE',
                );
              }}
            >
              🗑 Delete permanently
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This will permanently delete <b>{selectedIds.length}</b> selected request(s). This cannot be undone.
          Requests already <b>SENT</b> are protected and will be skipped automatically to preserve the email audit
          trail.
        </p>
      </Modal>
    </AppShell>
  );
}
