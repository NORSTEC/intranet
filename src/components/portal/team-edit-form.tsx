"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

type TeamEditContextValue = {
  dirty: boolean;
  markDirty: () => void;
  resetSignal: number;
};

const TeamEditContext = createContext<TeamEditContextValue | null>(null);

export function useTeamEdit() {
  const value = useContext(TeamEditContext);
  if (!value) {
    throw new Error("Team editor actions must be inside TeamEditForm");
  }
  return value;
}

export function TeamEditorActions() {
  const { dirty } = useTeamEdit();
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
      aria-labelledby="team-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="team-confirmation-title">
          Save team changes?
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          The team&apos;s details and member list will be updated for everyone.
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

export function TeamEditForm({
  action,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
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
    <TeamEditContext.Provider
      value={{
        dirty,
        markDirty: () => setDirty(true),
        resetSignal,
      }}
    >
      <form
        action={action}
        onChange={() => setDirty(true)}
        onReset={() => {
          setDirty(false);
          setResetSignal((value) => value + 1);
        }}
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
    </TeamEditContext.Provider>
  );
}
