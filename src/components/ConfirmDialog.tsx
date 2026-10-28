import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, Info } from 'lucide-react';

/**
 * v0.7.96: modern in-app confirm dialog — replaces the last native
 * window.confirm()/alert() "ugly boxes" (snapshot restore, Firebase reset).
 *
 * Usage:
 *   const ok = await showConfirmDialog({
 *     title: 'Restore this snapshot?',
 *     message: 'Current unsaved state will be overwritten.',
 *     confirmLabel: 'Restore',
 *     danger: true,
 *   });
 *
 * `ConfirmDialogHost` must be mounted once (App renders it in both the Atlas
 * and the writing-mode branch). While no host is mounted the promise resolves
 * to false, so a missed mount can never trigger a destructive action.
 */

export type ConfirmTone = 'danger' | 'warning' | 'info';

export interface ConfirmDialogOptions {
  title: string;
  /** Body text. Plain string (rendered as-is) or pre-built JSX. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button (destructive), warning = amber, info = accent. */
  tone?: ConfirmTone;
  /** Convenience shorthand for tone: 'danger'. */
  danger?: boolean;
  /** Small mono footnote rendered under the message (e.g. counts, dates). */
  detail?: string;
}

type HostHandler = (options: ConfirmDialogOptions) => Promise<boolean>;

let hostHandler: HostHandler | null = null;

export const showConfirmDialog = (options: ConfirmDialogOptions): Promise<boolean> => {
  if (hostHandler) return hostHandler(options);
  console.warn('[ConfirmDialog] No ConfirmDialogHost mounted — resolving false for:', options.title);
  return Promise.resolve(false);
};

export const registerConfirmHost = (handler: HostHandler | null): void => {
  hostHandler = handler;
};

const TONE_META: Record<ConfirmTone, { icon: typeof AlertTriangle; iconClasses: string; buttonClasses: string }> = {
  danger: {
    icon: AlertTriangle,
    iconClasses: 'bg-red-500/15 text-red-500 border-red-500/30',
    buttonClasses: 'bg-red-500 hover:bg-red-600 text-white border border-red-500/60 shadow-sm',
  },
  warning: {
    icon: AlertTriangle,
    iconClasses: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    buttonClasses: 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-500/60 shadow-sm',
  },
  info: {
    icon: Info,
    iconClasses: 'bg-accent/15 text-accent border-accent/30',
    buttonClasses: 'bg-accent hover:bg-accent/90 text-white border border-accent/60 shadow-sm',
  },
};

interface ActiveDialog extends ConfirmDialogOptions {
  resolve: (ok: boolean) => void;
}

export const ConfirmDialogHost: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const activeRef = useRef<ActiveDialog | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const settle = (ok: boolean) => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    setActive(null);
    current.resolve(ok);
  };

  useEffect(() => {
    registerConfirmHost((options: ConfirmDialogOptions) => {
      // One dialog at a time: a second request while one is open resolves the
      // older one as cancelled, then shows the new one.
      if (activeRef.current) {
        activeRef.current.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        const dialog: ActiveDialog = { ...options, resolve };
        activeRef.current = dialog;
        setActive(dialog);
      });
    });
    return () => registerConfirmHost(null);
  }, []);

  // Focus the confirm button when a dialog opens, and support Enter/Esc.
  useEffect(() => {
    if (!active) return;
    confirmButtonRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        settle(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        settle(true);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const tone = active.tone || (active.danger ? 'danger' : 'info');
  const meta = TONE_META[tone] || TONE_META.info;
  const ToneIcon = meta.icon;
  const helpIcon = tone === 'info' ? HelpCircle : ToneIcon;

  return (
    <div
      id="mundus-confirm-dialog-backdrop"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(false);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={active.title}
        className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 ${
          isDarkMode ? 'bg-[#181818] border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div className="p-5 pb-4 flex items-start gap-3.5">
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.iconClasses}`}>
            {helpIcon && React.createElement(helpIcon, { className: 'w-4.5 h-4.5' })}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-sm font-bold leading-snug">{active.title}</h3>
            {active.message && (
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 break-words">
                {active.message}
              </p>
            )}
            {active.detail && (
              <p className={`mt-2.5 p-2 rounded-lg text-[11px] font-mono break-words ${
                isDarkMode ? 'bg-neutral-800/80 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {active.detail}
              </p>
            )}
          </div>
        </div>
        <div className={`px-5 py-3.5 flex items-center justify-end gap-2 border-t ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50/60'
        }`}>
          <button
            type="button"
            onClick={() => settle(false)}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              isDarkMode
                ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-750'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {active.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={() => settle(true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${meta.buttonClasses}`}
          >
            {active.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
