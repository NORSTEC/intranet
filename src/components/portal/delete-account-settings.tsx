"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { deleteOwnAccount } from "@/app/(portal)/profile/actions";

export function DeleteAccountSettings({ name }: { name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setConfirming(false);
    setConfirmation("");
  }

  function deleteAccount() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnAccount();
      if (result && !result.ok) {
        setError(result.message);
        close();
      }
    });
  }

  return (
    <section aria-labelledby="danger-zone-heading" className="mt-20">
      <h2 className="text-h2" id="danger-zone-heading">
        Danger zone
      </h2>

      <div className="portal-surface mt-8 border-copper p-6 sm:p-8">
        <h3 className="text-h3">Delete my account</h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
          Your profile, your sign-in accounts, and your memberships are removed
          from the intranet. You lose access straight away, and everything is
          erased permanently 30 days later. Until then, email intranet@norstec.no
          if you change your mind.
        </p>
        {error && (
          <p className="mt-4 text-sm text-[#a33b2b]" role="alert">
            {error}
          </p>
        )}
        <button
          className="portal-button portal-button-danger mt-6"
          onClick={() => setConfirming(true)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            delete
          </span>
          Delete my account
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          busy={pending}
          confirmDisabled={
            confirmation.trim().toLocaleLowerCase("en") !==
            name.toLocaleLowerCase("en")
          }
          confirmIcon="delete"
          confirmLabel="Delete my account"
          danger
          onCancel={close}
          onConfirm={deleteAccount}
          title="Delete your account?"
        >
          <p>
            You are signed out on every device, your organization memberships
            and team roles end, and you cannot sign in again.
          </p>
          <p className="mt-3">
            Your data is kept for 30 days and then erased permanently. Email
            intranet@norstec.no before then if you want the account back.
          </p>
          <label className="mt-5 block">
            <span className="section-label mb-2 block opacity-50">
              Type &quot;{name}&quot; to confirm
            </span>
            <input
              className="portal-field"
              onChange={(event) => setConfirmation(event.target.value)}
              type="text"
              value={confirmation}
            />
          </label>
        </ConfirmDialog>
      )}
    </section>
  );
}
