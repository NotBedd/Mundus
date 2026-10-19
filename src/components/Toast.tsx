import React from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

/**
 * v0.7.93: modern toast notifications.
 * Rendered bottom-left, directly above the sidebar's sync status icon —
 * replaces the raw alert() popups for backup / import confirmations.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** ms before auto-dismiss (default 6000) */
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  isDarkMode: boolean;
}

const KIND_ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const KIND_COLORS: Record<ToastKind, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-rose-600 dark:text-rose-400',
  info: 'text-amber-600 dark:text-amber-400',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss, isDarkMode }) => {
  // Stacked column anchored to the bottom edge: newest toast at the bottom,
  // closest to the sync status icon below it.
  return (
    <div
      id="mundus-toast-stack"
      aria-live="polite"
      className="fixed left-3 bottom-20 z-[110] flex flex-col-reverse gap-2 w-[min(24rem,calc(100vw-1.5rem))] pointer-events-none"
    >
      {toasts.map((toast) => {
        const Icon = KIND_ICONS[toast.kind] || Info;
        return (
          <div
            key={toast.id}
            role="status"
            className={`mundus-toast pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border shadow-xl backdrop-blur-md ${
              isDarkMode ? 'bg-neutral-900/95 border-neutral-700/80' : 'bg-white/95 border-neutral-200'
            }`}
          >
            <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${KIND_COLORS[toast.kind] || KIND_COLORS.info}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white leading-snug break-words">
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              title="Dismiss"
              className={`p-0.5 rounded shrink-0 transition-colors cursor-pointer ${
                isDarkMode ? 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

