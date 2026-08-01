"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

type Confirmation = "cancel" | "save" | null;

type ProfileEditContextValue = {
  dirty: boolean;
  markDirty: () => void;
  requestCancel: () => void;
  saveBlocked: boolean;
  setSaveBlocked: (source: string, blocked: boolean) => void;
};

const ProfileEditContext = createContext<ProfileEditContextValue | null>(null);

export function useProfileEdit() {
  const value = useContext(ProfileEditContext);
  if (!value) throw new Error("Profile editor actions must be inside ProfileEditForm");
  return value;
}

export function ProfileEditorActions() {
  const { dirty, requestCancel, saveBlocked } = useProfileEdit();
  const { pending } = useFormStatus();

  return (
    <div className="flex min-h-11 flex-nowrap justify-end gap-3 overflow-x-auto">
      <button className="portal-button shrink-0 whitespace-nowrap" disabled={!dirty || pending} type="reset">
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          undo
        </span>
        Revert changes
      </button>
      <button
        className="portal-button shrink-0 whitespace-nowrap"
        disabled={pending}
        onClick={requestCancel}
        type="button"
      >
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          close
        </span>
        Cancel
      </button>
      <button className="portal-button shrink-0 whitespace-nowrap" disabled={!dirty || pending || saveBlocked} type="submit">
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          {pending ? "progress_activity" : "save"}
        </span>
        {pending ? "Saving…" : "Save all"}
      </button>
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  onClose,
  onConfirm,
}: {
  confirmation: Exclude<Confirmation, null>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isSaving = confirmation === "save";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      aria-labelledby="profile-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="profile-confirmation-title">
          {isSaving ? "Save profile changes?" : "Discard profile changes?"}
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          {isSaving
            ? "Your profile and experience changes will be saved together."
            : "Your unsaved changes will be lost."}
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
              {isSaving ? "save" : "delete"}
            </span>
            {isSaving ? "Save changes" : "Discard changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileEditForm({
  action,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [saveBlocks, setSaveBlocks] = useState<Set<string>>(() => new Set());
  const confirmedSubmit = useRef(false);
  const pendingSubmitter = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const setSaveBlocked = useCallback((source: string, blocked: boolean) => {
    setSaveBlocks((current) => {
      const next = new Set(current);
      if (blocked) next.add(source);
      else next.delete(source);
      return next;
    });
  }, []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  const requestCancel = () => {
    if (dirty) {
      setConfirmation("cancel");
      return;
    }
    router.push("/profile");
  };

  const confirmAction = () => {
    if (confirmation === "cancel") {
      router.push("/profile");
      return;
    }
    confirmedSubmit.current = true;
    setConfirmation(null);
    formRef.current?.requestSubmit(pendingSubmitter.current ?? undefined);
    pendingSubmitter.current = null;
  };

  return (
    <ProfileEditContext.Provider value={{
      dirty,
      markDirty: () => setDirty(true),
      requestCancel,
      saveBlocked: saveBlocks.size > 0,
      setSaveBlocked,
    }}>
      <form
        action={action}
        onChange={() => setDirty(true)}
        onReset={() => setDirty(false)}
        onSubmit={(event) => {
          const submitter = event.nativeEvent.submitter as
            | HTMLButtonElement
            | HTMLInputElement
            | null;
          if (submitter?.dataset.directSubmit === "true") return;
          if (confirmedSubmit.current) {
            confirmedSubmit.current = false;
            return;
          }
          if (!dirty) return;
          event.preventDefault();
          pendingSubmitter.current = submitter;
          setConfirmation("save");
        }}
        ref={formRef}
      >
        {children}
      </form>
      {confirmation && (
        <ConfirmationDialog
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmAction}
        />
      )}
    </ProfileEditContext.Provider>
  );
}
