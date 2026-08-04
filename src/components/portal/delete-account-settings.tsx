"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteOwnAccount } from "@/app/(portal)/profile/actions";

export function DeleteAccountSettings() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirming) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirming]);

  function deleteAccount() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnAccount();
      if (result && !result.ok) {
        setError(result.message);
        setConfirming(false);
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
          from the portal. You lose access straight away, and everything is
          erased permanently 30 days later. Until then, email portal@norstec.no
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
        <div
          aria-labelledby="delete-account-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          role="alertdialog"
        >
          <div className="portal-surface w-full max-w-md p-7 sm:p-8">
            <h2 className="text-2xl font-medium" id="delete-account-title">
              Delete your account?
            </h2>
            <p className="mt-4 leading-relaxed opacity-65">
              You are signed out on every device, your organization memberships
              and team roles end, and you cannot sign in again.
            </p>
            <p className="mt-3 leading-relaxed opacity-65">
              Your data is kept for 30 days and then erased permanently. Email
              portal@norstec.no before then if you want the account back.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                autoFocus
                className="portal-button"
                disabled={pending}
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="portal-button portal-button-danger"
                disabled={pending}
                onClick={deleteAccount}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  {pending ? "progress_activity" : "delete"}
                </span>
                {pending ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
