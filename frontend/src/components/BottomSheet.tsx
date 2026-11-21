import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons.tsx';

/**
 * A sheet that rises from the bottom of the map on a phone, for choices too long
 * to fit in the toolbar. Tapping the dimmed map behind it, the close button or
 * Escape puts it away.
 */
export default function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portalled to the body, so it covers the whole screen (tab bar included)
  // wherever it is opened from, even inside the map's toolbar.
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85%] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-600" />
        <div className="mt-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
