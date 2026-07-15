'use client';

import { Modal } from '@/components/ui/Modal';
import type { EmailPreview } from '@/types';

export function EmailPreviewModal({
  open,
  onClose,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  preview: EmailPreview | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Email Preview" wide>
      {preview ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
            <div className="font-semibold text-slate-500">Subject:</div>
            <div className="font-medium">{preview.subject}</div>
            <div className="font-semibold text-slate-500">To:</div>
            <div>{preview.to.join('; ')}</div>
            <div className="font-semibold text-slate-500">Cc:</div>
            <div>{preview.cc.length ? preview.cc.join('; ') : <span className="text-slate-400">—</span>}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-slate-400">Loading preview…</div>
      )}
    </Modal>
  );
}
