"use client";

import { useEffect, useId, type ReactNode } from "react";

/**
 * The confirmation step every destructive portal-management action shares.
 * Kept generic rather than living inside one action panel, because a person
 * page renders several panels and each of them needs the same dialog.
 */
export function ConfirmDialog({
  busy,
  children,
  confirmDisabled = false,
  confirmIcon,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
  title,
}: {
  busy: boolean;
  children: ReactNode;
  confirmDisabled?: boolean;
  confirmIcon: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const titleId = useId();

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface max-h-[90vh] w-full max-w-md overflow-y-auto p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id={titleId}>
          {title}
        </h2>
        <div className="mt-4 leading-relaxed opacity-75">{children}</div>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            autoFocus
            className="portal-button"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`portal-button${danger ? " portal-button-danger" : ""}`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              {busy ? "progress_activity" : confirmIcon}
            </span>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
