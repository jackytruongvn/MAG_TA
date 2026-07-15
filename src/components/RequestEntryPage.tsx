'use client';

/**
 * Shared entry page for Create / Update / Cancelled request types.
 * Toolbar: Add row · Delete selected · Validate · Preview Email ·
 * Save Draft · Submit to Queue · Send Urgent Now (with confirmation).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EntryGrid } from '@/components/EntryGrid';
import { EmailPreviewModal } from '@/components/EmailPreviewModal';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { getColumnsForType, type ColumnDef } from '@/lib/columns';
import { emptyRow, normalizeRowValues } from '@/lib/parseExcel';
import { validateRows } from '@/lib/validation/request';
import type { AppConfigShape, EmailPreview, RequestType, RowData } from '@/types';

const TITLES: Record<RequestType, { title: string; hint: string }> = {
  CREATE: { title: 'Create — New Hire Onboarding', hint: 'Enter new-hire information, paste directly from Excel.' },
  UPDATE: { title: 'Update — Change Onboarding Info', hint: 'Enter update/change requests for existing onboarding.' },
  CANCELLED: { title: 'Cancelled — Cancel Onboarding', hint: 'Enter onboarding cancellation requests.' },
};

export function RequestEntryPage({ type }: { type: RequestType }) {
  const router = useRouter();
  const { toast } = useToast();
  const [config, setConfig] = useState<Partial<AppConfigShape> | null>(null);
  const [rows, setRows] = useState<RowData[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});
  const [pasteInfo, setPasteInfo] = useState<string>('');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmUrgent, setConfirmUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  const columns: ColumnDef[] = useMemo(
    () => getColumnsForType(type, config?.columns),
    [type, config],
  );

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setConfig(d.config))
      .catch(() => setConfig(null));
  }, []);

  // Guards against React 18 Strict Mode's dev-only double-invocation of effects:
  // without this, the 2nd invocation would find sessionStorage already consumed
  // by the 1st and overwrite the prefilled rows with a blank one.
  const seededRows = useRef(false);

  useEffect(() => {
    if (seededRows.current || columns.length === 0) return;
    seededRows.current = true;

    const key = `prefillRows_${type}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      sessionStorage.removeItem(key);
      try {
        const parsed = JSON.parse(stored) as RowData[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed.map((r) => normalizeRowValues({ ...emptyRow(columns), ...r }, columns)));
          setPasteInfo(`Prefilled ${parsed.length} row(s) from Dashboard — edit the fields that changed.`);
          return;
        }
      } catch {
        // fall through to a blank row
      }
    }
    setRows([emptyRow(columns)]);
  }, [columns.length, type]);

  const nonEmptyRows = () => rows.filter((r) => Object.values(r).some((v) => (v ?? '').trim() && v !== 'Normal'));

  const runValidation = (): boolean => {
    const data = nonEmptyRows();
    const errs = validateRows(data, columns);
    setErrors(errs);
    const count = Object.keys(errs).length;
    if (count > 0) toast('error', `${count} row(s) have validation errors (red cells)`);
    else toast('success', `All ${data.length} row(s) are valid`);
    return count === 0;
  };

  const doPreview = async () => {
    const data = nonEmptyRows();
    if (data.length === 0) return toast('error', 'No data rows to preview');
    setPreviewOpen(true);
    setPreview(null);
    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: type, rows: data }),
    });
    if (res.ok) setPreview(await res.json());
    else {
      setPreviewOpen(false);
      toast('error', 'Preview failed');
    }
  };

  const save = async (mode: 'draft' | 'submit' | 'urgent') => {
    const data = nonEmptyRows();
    if (data.length === 0) return toast('error', 'No data rows to save');
    if (mode !== 'draft' && !runValidation()) return;

    setBusy(true);
    try {
      const res = await fetch('/api/requests/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: type, rows: data, mode }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.validationErrors) {
          setErrors(body.validationErrors);
          toast('error', 'Server validation failed — check red cells');
        } else {
          toast('error', body.error ?? 'Save failed');
        }
        return;
      }
      if (mode === 'draft') {
        toast('success', `Saved ${body.createdIds.length} row(s) as Draft`);
      } else if (body.send) {
        const s = body.send.sent.length;
        const f = body.send.failed.length;
        toast(f > 0 ? 'error' : 'success', `Urgent send: ${s} sent, ${f} failed`);
      } else {
        toast(
          'success',
          `Submitted ${body.createdIds.length} row(s) — status ${body.status}` +
            (body.scheduledSendAt ? `, next send: ${new Date(body.scheduledSendAt).toLocaleString('vi-VN')}` : ''),
        );
      }
      router.push('/dashboard');
    } finally {
      setBusy(false);
      setConfirmUrgent(false);
    }
  };

  const meta = TITLES[type];
  const autoFillCc = config?.emailSettings?.autoFillCcFromLineManager ?? true;
  const allowCcEdit = config?.emailSettings?.allowManualCcEdit ?? true;
  const allowUrgent = config?.emailSettings?.allowUrgentSend ?? true;

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{meta.title}</h2>
          <p className="text-sm text-slate-500">{meta.hint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-outline" onClick={() => setRows([...rows, emptyRow(columns)])}>
            ＋ Add row
          </button>
          <button
            className="btn-outline"
            disabled={selected.size === 0}
            onClick={() => {
              setRows(rows.filter((_, i) => !selected.has(i)));
              setSelected(new Set());
              setErrors({});
            }}
          >
            🗑 Delete selected ({selected.size})
          </button>
          <button className="btn-outline" onClick={runValidation}>✔ Validate</button>
          <button className="btn-outline" onClick={doPreview}>👁 Preview Email</button>
          <div className="flex-1" />
          <button className="btn-outline" disabled={busy} onClick={() => save('draft')}>
            💾 Save Draft
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => save('submit')}>
            📤 Submit to Queue
          </button>
          {allowUrgent && (
            <button className="btn-danger" disabled={busy} onClick={() => setConfirmUrgent(true)}>
              ⚡ Send Urgent Now
            </button>
          )}
        </div>

        {pasteInfo && (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{pasteInfo}</div>
        )}

        <EntryGrid
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          errors={errors}
          selected={selected}
          onSelectedChange={setSelected}
          autoFillCc={autoFillCc}
          allowCcEdit={allowCcEdit}
          onPasteInfo={(count, header) =>
            setPasteInfo(`✅ Pasted ${count} row(s)${header ? ' (header row detected & skipped)' : ''}`)
          }
        />

        <p className="text-xs text-slate-400">
          Priority <b>Normal</b> = queued for the next scheduled send. Priority <b>Urgent</b> = sent immediately on
          submit. Cc is auto-filled from Line Manager email{allowCcEdit ? ' and can be edited (separate multiple emails with ; or ,)' : ''}.
        </p>
      </div>

      <EmailPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} preview={preview} />

      <Modal
        open={confirmUrgent}
        onClose={() => setConfirmUrgent(false)}
        title="Confirm Urgent Send"
        footer={
          <>
            <button className="btn-outline" onClick={() => setConfirmUrgent(false)}>Cancel</button>
            <button className="btn-danger" disabled={busy} onClick={() => save('urgent')}>
              ⚡ Yes, send now
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This will send the onboarding email <b>immediately</b> from{' '}
          <b>{config?.emailSettings?.senderMailbox ?? 'the system mailbox'}</b> without waiting for the schedule.
          Continue?
        </p>
      </Modal>
    </AppShell>
  );
}
