'use client';

/**
 * Admin-only configuration page.
 * Tabs: Email Settings · Schedule Settings · Templates · Columns · Roles.
 * Server enforces ADMIN on PUT /api/config; the UI also hides itself
 * from non-admin users.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/ui/Toast';
import { EmailPreviewModal } from '@/components/EmailPreviewModal';
import type { AppConfigShape, EmailPreview, RequestType } from '@/types';
import { cn } from '@/lib/utils';

const TABS = ['Email Settings', 'Schedule Settings', 'Templates', 'Columns', 'Roles'] as const;

const SAMPLE_ROW = {
  salutation: 'Ms.', fullName: 'Nguyễn Thị Minh Anh', dob: '1995-08-12',
  positionEng: 'Senior TA Executive', positionVie: 'Chuyên viên TA cao cấp', jobLevel: 'P3',
  division: 'Human Resources', departmentEng: 'Talent Acquisition', departmentVie: 'Tuyển dụng',
  functionEng: 'HR', functionVie: 'Nhân sự', startingDate: '2026-08-03', location: 'HCMC',
  officeLocation: 'Masteri An Phú', project: 'Grand Marina', lineManager: 'Trần Văn Bình',
  lineManagerEmail: 'binh.tran@masterisegroup.com', workEmail: 'Yes', phoneNumber: '0903123456',
  company: 'Masterise Group', lienQuan: 'MG', priority: 'Normal',
  cc: 'binh.tran@masterisegroup.com', notes: '',
  updateReason: 'Change starting date and division', fieldsChanged: 'Starting Date, Division',
  cancelReason: 'Candidate declined offer',
};

export default function ConfigPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Email Settings');
  const [config, setConfig] = useState<AppConfigShape | null>(null);
  const [tplType, setTplType] = useState<RequestType>('CREATE');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setConfig({ ...d.config, roles: d.config.roles ?? { admins: [], taUsers: [], viewers: [], defaultRole: 'TA', taCanViewAll: true } }));
  }, []);

  const saveKey = async (key: keyof AppConfigShape) => {
    if (!config) return;
    setBusy(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: config[key] }),
      });
      const d = await res.json();
      if (res.ok) toast('success', `Saved ${key}`);
      else toast('error', d.error ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const previewTemplate = async () => {
    setPreviewOpen(true);
    setPreview(null);
    // Save current template first so the preview uses the edited version
    await saveKey('templates');
    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: tplType, rows: [SAMPLE_ROW] }),
    });
    if (res.ok) setPreview(await res.json());
    else setPreviewOpen(false);
  };

  const emailListEditor = (
    label: string,
    value: string[],
    onChange: (v: string[]) => void,
    hint?: string,
  ) => (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input min-h-[70px] font-mono text-xs"
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  const body = useMemo(() => {
    if (!config) return <div className="py-10 text-center text-slate-400">Loading config…</div>;

    if (tab === 'Email Settings') {
      const es = config.emailSettings;
      const set = (patch: Partial<typeof es>) => setConfig({ ...config, emailSettings: { ...es, ...patch } });
      return (
        <div className="max-w-2xl space-y-4">
          <div>
            <label className="label">System sender mailbox</label>
            <input className="input" value={es.senderMailbox} onChange={(e) => set({ senderMailbox: e.target.value })} />
          </div>
          {emailListEditor('Default To (one email per line)', es.defaultTo, (v) => set({ defaultTo: v }))}
          {toggle('Auto fill Cc from Line Manager email', es.autoFillCcFromLineManager, (v) => set({ autoFillCcFromLineManager: v }))}
          {toggle('Allow manual edit of Cc', es.allowManualCcEdit, (v) => set({ allowManualCcEdit: v }))}
          {toggle('Allow urgent send immediately', es.allowUrgentSend, (v) => set({ allowUrgentSend: v }))}
          <button className="btn-primary" disabled={busy} onClick={() => saveKey('emailSettings')}>💾 Save Email Settings</button>
        </div>
      );
    }

    if (tab === 'Schedule Settings') {
      const ss = config.scheduleSettings;
      const set = (patch: Partial<typeof ss>) => setConfig({ ...config, scheduleSettings: { ...ss, ...patch } });
      return (
        <div className="max-w-2xl space-y-4">
          {toggle('Enable schedule (queued Normal requests are sent at the times below)', ss.enabled, (v) => set({ enabled: v }))}
          <div>
            <label className="label">Send times (HH:mm, one per line)</label>
            <textarea
              className="input min-h-[70px] font-mono text-xs"
              value={ss.sendTimes.join('\n')}
              onChange={(e) => set({ sendTimes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
            />
            <p className="mt-1 text-xs text-slate-400">
              If a submit happens after the last slot of the day, it is queued for the first slot of the next (working) day.
            </p>
          </div>
          <div>
            <label className="label">Timezone</label>
            <input className="input" value={ss.timezone} onChange={(e) => set({ timezone: e.target.value })} />
          </div>
          {toggle('Only send on working days (skip Sat/Sun)', ss.onlyWorkingDays, (v) => set({ onlyWorkingDays: v }))}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => saveKey('scheduleSettings')}>💾 Save Schedule Settings</button>
            <button
              className="btn-outline"
              disabled={busy}
              onClick={async () => {
                const res = await fetch('/api/scheduler/run-once', { method: 'POST' });
                const d = await res.json();
                if (res.ok) toast('success', `Scheduler run: picked ${d.picked}, sent ${d.sent}, failed ${d.failed}`);
                else toast('error', d.error ?? 'Run failed');
              }}
            >
              ▶ Run scheduler once now
            </button>
          </div>
        </div>
      );
    }

    if (tab === 'Templates') {
      const tpl = config.templates[tplType];
      const set = (patch: Partial<typeof tpl>) =>
        setConfig({ ...config, templates: { ...config.templates, [tplType]: { ...tpl, ...patch } } });
      return (
        <div className="max-w-3xl space-y-4">
          <div className="flex gap-1.5">
            {(['CREATE', 'UPDATE', 'CANCELLED'] as RequestType[]).map((t) => (
              <button
                key={t}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  tplType === t ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-600',
                )}
                onClick={() => setTplType(t)}
              >
                Template {t}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input font-mono text-xs" value={tpl.subject} onChange={(e) => set({ subject: e.target.value })} />
          </div>
          <div>
            <label className="label">Body (HTML)</label>
            <textarea className="input min-h-[260px] font-mono text-xs" value={tpl.body} onChange={(e) => set({ body: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">
              Placeholders: {'{{FullName}} {{StartingDate}} {{OfficeLocation}} {{Division}} {{LineManagerEmail}} {{RowsTable}} {{SubmittedByEmail}} {{UpdateReason}} {{CancelReason}}'}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => saveKey('templates')}>💾 Save Templates</button>
            <button className="btn-outline" disabled={busy} onClick={previewTemplate}>👁 Preview with sample data</button>
          </div>
        </div>
      );
    }

    if (tab === 'Columns') {
      const cols = config.columns;
      const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= cols.length) return;
        const next = [...cols];
        [next[i], next[j]] = [next[j], next[i]];
        setConfig({ ...config, columns: next });
      };
      const setCol = (i: number, patch: Partial<(typeof cols)[number]>) => {
        const next = [...cols];
        next[i] = { ...next[i], ...patch };
        setConfig({ ...config, columns: next });
      };
      return (
        <div className="max-w-3xl space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="py-2">Order</th>
                <th>Key</th>
                <th>Display name</th>
                <th className="text-center">Visible</th>
                <th className="text-center">Required</th>
              </tr>
            </thead>
            <tbody>
              {cols.map((c, i) => (
                <tr key={c.key} className="border-b border-slate-100">
                  <td className="py-1.5">
                    <button className="btn-outline btn-sm" onClick={() => move(i, -1)}>↑</button>{' '}
                    <button className="btn-outline btn-sm" onClick={() => move(i, 1)}>↓</button>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{c.key}</td>
                  <td>
                    <input className="input" value={c.label ?? ''} onChange={(e) => setCol(i, { label: e.target.value })} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={c.visible !== false} onChange={(e) => setCol(i, { visible: e.target.checked })} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={!!c.required} onChange={(e) => setCol(i, { required: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary" disabled={busy} onClick={() => saveKey('columns')}>💾 Save Columns</button>
        </div>
      );
    }

    // Roles
    const roles = config.roles;
    const set = (patch: Partial<typeof roles>) => setConfig({ ...config, roles: { ...roles, ...patch } });
    return (
      <div className="max-w-2xl space-y-4">
        {emailListEditor('Admins (one email per line)', roles.admins, (v) => set({ admins: v }), 'Full access: config, templates, schedule, all data. Emails in ADMIN_EMAILS (.env) are always admin.')}
        {emailListEditor('TA Users', roles.taUsers, (v) => set({ taUsers: v }), 'Can create/update/cancel requests.')}
        {emailListEditor('Viewers', roles.viewers, (v) => set({ viewers: v }), 'Read-only dashboard/export.')}
        <div>
          <label className="label">Default role for everyone else</label>
          <select className="input" value={roles.defaultRole} onChange={(e) => set({ defaultRole: e.target.value as typeof roles.defaultRole })}>
            <option value="TA">TA</option>
            <option value="VIEWER">VIEWER</option>
          </select>
        </div>
        {toggle('TA users can view ALL records (off = only records they created)', roles.taCanViewAll, (v) => set({ taCanViewAll: v }))}
        <button className="btn-primary" disabled={busy} onClick={() => saveKey('roles')}>💾 Save Roles</button>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, tab, tplType, busy]);

  if (status === 'loading') return <AppShell><div className="py-10 text-center text-slate-400">Loading…</div></AppShell>;

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="card mx-auto max-w-md text-center">
          <div className="text-3xl">🔒</div>
          <h2 className="mt-2 font-semibold text-slate-700">Admin only</h2>
          <p className="mt-1 text-sm text-slate-500">The Config page requires the ADMIN role.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Configuration</h2>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              className={cn(
                'rounded-t-md px-4 py-2 text-sm font-medium',
                tab === t ? 'border border-b-0 border-slate-200 bg-white text-brand-700' : 'text-slate-500 hover:text-slate-700',
              )}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="card">{body}</div>
      </div>
      <EmailPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} preview={preview} />
    </AppShell>
  );
}
