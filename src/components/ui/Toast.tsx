'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const ToastContext = createContext<{ toast: (type: Toast['type'], message: string) => void }>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-96 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-md px-4 py-3 text-sm text-white shadow-lg',
              t.type === 'success' && 'bg-emerald-600',
              t.type === 'error' && 'bg-red-600',
              t.type === 'info' && 'bg-slate-700',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
