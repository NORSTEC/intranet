"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { setOwnDirectoryVisibility } from "@/app/(portal)/profile/actions";
import { Toast } from "@/components/portal/toast";

export function DirectoryVisibilitySettings({
  initialVisible,
}: {
  initialVisible: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const switchLabelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(initialVisible);
  const [draftVisible, setDraftVisible] = useState(initialVisible);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setDraftVisible(visible);
    setError(null);
    setOpen(true);
  }

  const closeDialog = useCallback(() => {
    if (pending) return;
    setDraftVisible(visible);
    setError(null);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [pending, visible]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!pending) closeDialog();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const nodes = dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [closeDialog, open, pending]);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setOwnDirectoryVisibility(draftVisible);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      setVisible(result.visible);
      setDraftVisible(result.visible);
      setOpen(false);
      setToast({ id: Date.now(), message: "Directory visibility updated." });
      router.refresh();
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    });
  }

  return (
    <>
      <button
        className="portal-button shrink-0 whitespace-nowrap"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[1.1rem]"
        >
          {visible ? "visibility" : "visibility_off"}
        </span>
        Visibility
      </button>

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          status="success"
        />
      )}

      {open && (
        <div
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          ref={dialogRef}
          role="dialog"
        >
          <div className="portal-surface max-h-[90vh] w-full max-w-md overflow-y-auto p-7 sm:p-8">
            <h2 className="text-2xl font-medium" id={titleId}>
              Directory visibility
            </h2>
            <p
              className="mt-4 text-sm leading-relaxed opacity-65"
              id={descriptionId}
            >
              Turn this off to hide your profile, memberships, teams, roles,
              and contact details from member directories. You and authorized
              administrators can still see them.
            </p>

            <div className="mt-7 flex items-center justify-between gap-6 border-y border-moody/20 py-5">
              <div>
                <p className="font-medium" id={switchLabelId}>
                  Show me to other members
                </p>
                <p
                  aria-live="polite"
                  className="mt-1 text-sm font-medium opacity-55"
                >
                  {draftVisible ? "On" : "Off"}
                </p>
              </div>
              <button
                aria-checked={draftVisible}
                aria-describedby={descriptionId}
                aria-labelledby={switchLabelId}
                className="inline-flex h-11 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moody disabled:cursor-not-allowed disabled:opacity-40"
                disabled={pending}
                onClick={() => setDraftVisible((current) => !current)}
                role="switch"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-8 w-14 items-center rounded-full border-2 p-1 transition-colors ${
                    draftVisible
                      ? "border-beachball bg-beachball"
                      : "border-moody/35 bg-transparent"
                  }`}
                >
                  <span
                    className={`size-5 rounded-full bg-moody transition-transform ${
                      draftVisible ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            </div>

            {error && (
              <p
                className="mt-5 rounded-2xl border border-copper p-3 text-sm leading-relaxed"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                className="portal-button"
                disabled={pending}
                onClick={closeDialog}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  close
                </span>
                Cancel
              </button>
              <button
                className="portal-button"
                disabled={pending || draftVisible === visible}
                onClick={save}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  {pending ? "progress_activity" : "save"}
                </span>
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
