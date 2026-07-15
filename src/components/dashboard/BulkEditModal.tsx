'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ALL_COLUMNS } from '@/lib/columns';

/** Fields offered in the bulk edit form. */
const BULK_FIELDS = [
  'startingDate', 'location', 'officeLocation', 'division', 'company', 'project',
  'lineManager', 'lineManagerEmail', 'workEmail', 'priority', 'cc', 'notes',
];

export function BulkEditModal({
  open,
  count,
  onClose,
  onApply,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onApply: (fields: Record<string, string>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    const fields: Record<string, string> = {};
    for (const k of BULK_FIELDS) if (enabled[k]) fields[k] = values[k] ?? '';
    if (Object.keys(fields).length === 0) return;
    setBusy(true);
    try {
      await onApply(fields);
      setEnabled({});
      setValues({});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk edit ${count} selected row(s)`}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !Object.values(enabled).some(Boolean)} onClick={apply}>
            Apply to {count} row(s)
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Tick the fields to change. The value will be applied to every selected row (SENT rows are skipped).
      </p>
      <div className="space-y-2">
        {BULK_FIELDS.map((key) => {
          const col = ALL_COLUMNS[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!enabled[key]}
                onChange={(e) => setEnabled({ ...enabled, [key]: e.target.checked })}
              />
              <span className="w-40 shrink-0 text-sm text-slate-600">{col.label}</span>
              {key === 'priority' ? (
                <select
                  className="input"
                  disabled={!enabled[key]}
                  value={values[key] ?? 'Normal'}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                >
                  <option>Normal</option>
                  <option>Urgent</option>
                </select>
              ) : key === 'workEmail' ? (
                <select
                  className="input"
                  disabled={!enabled[key]}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                >
                  <option value="">—</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              ) : (
                <input
                  className="input"
                  disabled={!enabled[key]}
                  placeholder={col.type === 'date' ? 'dd/MM/yyyy' : ''}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
