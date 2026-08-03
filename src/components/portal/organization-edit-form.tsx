"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

type OrganizationEditContextValue = {
  dirty: boolean;
  markDirty: () => void;
};

const OrganizationEditContext =
  createContext<OrganizationEditContextValue | null>(null);

function useOrganizationEdit() {
  const value = useContext(OrganizationEditContext);
  if (!value) {
    throw new Error(
      "Organization editor actions must be inside OrganizationEditForm",
    );
  }
  return value;
}

export function OrganizationEditorActions() {
  const { dirty } = useOrganizationEdit();
  const { pending } = useFormStatus();

  return (
    <div className="flex min-h-11 flex-nowrap justify-end gap-3 overflow-x-auto">
      <button
        className="portal-button shrink-0 whitespace-nowrap"
        disabled={!dirty || pending}
        type="reset"
      >
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          undo
        </span>
        Revert changes
      </button>
      <button
        className="portal-button shrink-0 whitespace-nowrap"
        disabled={!dirty || pending}
        type="submit"
      >
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          {pending ? "progress_activity" : "save"}
        </span>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function ConfirmationDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      aria-labelledby="organization-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="organization-confirmation-title">
          Save organization changes?
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          The organization settings will be updated for everyone.
        </p>
        <div className="mt-7 flex flex-wrap justify-start gap-3">
          <button autoFocus className="portal-button" onClick={onClose} type="button">
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              arrow_back
            </span>
            Keep editing
          </button>
          <button className="portal-button" onClick={onConfirm} type="button">
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              save
            </span>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrganizationEditForm({
  action,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmedSubmit = useRef(false);
  const pendingSubmitter = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  const confirmSave = () => {
    confirmedSubmit.current = true;
    setConfirming(false);
    formRef.current?.requestSubmit(pendingSubmitter.current ?? undefined);
    pendingSubmitter.current = null;
  };

  return (
    <OrganizationEditContext.Provider
      value={{
        dirty,
        markDirty: () => setDirty(true),
      }}
    >
      <form
        action={action}
        onChange={() => setDirty(true)}
        onReset={() => setDirty(false)}
        onSubmit={(event) => {
          const submitter = event.nativeEvent.submitter as
            | HTMLButtonElement
            | HTMLInputElement
            | null;
          if (confirmedSubmit.current) {
            confirmedSubmit.current = false;
            return;
          }
          if (!dirty) return;
          event.preventDefault();
          pendingSubmitter.current = submitter;
          setConfirming(true);
        }}
        ref={formRef}
      >
        {children}
      </form>
      {confirming && (
        <ConfirmationDialog
          onClose={() => setConfirming(false)}
          onConfirm={confirmSave}
        />
      )}
    </OrganizationEditContext.Provider>
  );
}
