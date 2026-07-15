'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

interface AuditEntry {
  id: string;
  action: string;
  actorEmail: string;
  oldValueJson: string | null;
  newValueJson: string | null;
  createdAt: string;
}

interface EmailLogEntry {
  id: string;
  toRecipients: string;
  ccRecipients: string | null;
  subject: string;
  status: string;
  errorMessage: string | null;
  sentBy: string | null;
  sentAt: string | null;
  createdAt: string;
}

export function AuditLogModal({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    fetch(`/api/requests/${requestId}/audit`)
      .then((r) => r.json())
      .then((d) => {
        setAudit(d.auditLogs ?? []);
        setEmails(d.emailLogs ?? []);
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '—');

  return (
    <Modal open={!!requestId} onClose={onClose} title="Audit Log" wide>
      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-5 text-sm">
          <div>
            <h4 className="mb-2 font-semibold text-slate-700">Email send history</h4>
            {emails.length === 0 ? (
              <p className="text-slate-400">No emails sent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-1 pr-3">Time</th>
                      <th className="py-1 pr-3">Status</th>
                      <th className="py-1 pr-3">To</th>
                      <th className="py-1 pr-3">Cc</th>
                      <th className="py-1 pr-3">Subject</th>
                      <th className="py-1 pr-3">Sent by</th>
                      <th className="py-1">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 align-top">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{fmt(e.sentAt ?? e.createdAt)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={e.status === 'SENT' ? 'text-emerald-600' : 'text-red-600'}>{e.status}</span>
                        </td>
                        <td className="py-1.5 pr-3 max-w-[200px] break-words">{e.toRecipients}</td>
                        <td className="py-1.5 pr-3 max-w-[160px] break-words">{e.ccRecipients ?? '—'}</td>
                        <td className="py-1.5 pr-3 max-w-[200px] break-words">{e.subject}</td>
                        <td className="py-1.5 pr-3 max-w-[160px] break-words">{e.sentBy ?? '—'}</td>
                        <td className="py-1.5 text-red-600 max-w-[160px] break-words">{e.errorMessage ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-slate-700">Actions</h4>
            {audit.length === 0 ? (
              <p className="text-slate-400">No audit entries.</p>
            ) : (
              <ul className="space-y-2">
                {audit.map((a) => (
                  <li key={a.id} className="rounded-md border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-brand-700">{a.action}</span>
                      <span className="text-xs text-slate-400">{fmt(a.createdAt)}</span>
                    </div>
                    <div className="text-xs text-slate-500">by {a.actorEmail}</div>
                    {(a.oldValueJson || a.newValueJson) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-400">details</summary>
                        {a.oldValueJson && (
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-[11px]">old: {a.oldValueJson}</pre>
                        )}
                        {a.newValueJson && (
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-[11px]">new: {a.newValueJson}</pre>
                        )}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
