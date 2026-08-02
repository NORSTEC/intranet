"use client";

import { useState, useTransition } from "react";
import { deactivatePortalAccess } from "@/app/(portal)/profile/actions";

export function PortalAccessSettings({
  canLeavePortal,
  hasPersonalEmail,
}: {
  canLeavePortal: boolean;
  hasPersonalEmail: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function deactivate() {
    setError(null);
    startTransition(async () => {
      const result = await deactivatePortalAccess();
      if (result && !result.ok) {
        setError(result.message);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="portal-surface mt-10 p-6 sm:p-8" aria-labelledby="portal-access-heading">
      <h2 className="text-2xl font-medium" id="portal-access-heading">Portal access</h2>

      {!hasPersonalEmail && (
        <div className="mt-5 rounded-2xl border border-copper p-4 text-sm leading-relaxed">
          <p className="font-medium">Personal email not linked</p>
          <p className="mt-1 opacity-65">
            You may lose sign-in access when your organization account is disabled. Email linking and notifications are disabled during testing; contact Norstec IT if this applies to you.
          </p>
        </div>
      )}

      {canLeavePortal && (
        <div className="mt-7 border-t border-moody pt-6">
          <p className="max-w-2xl text-sm leading-relaxed opacity-65">
            Leaving disables future portal sign-in while preserving required membership history. It is not a GDPR deletion.
          </p>
          {error && <p className="mt-4 text-sm text-[#a33b2b]" role="alert">{error}</p>}
          <button
            className="portal-button mt-5"
            onClick={() => setConfirming(true)}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">logout</span>
            Leave portal
          </button>
        </div>
      )}

      {confirming && (
        <div
          aria-labelledby="leave-portal-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          role="alertdialog"
        >
          <div className="portal-surface w-full max-w-md p-7 sm:p-8">
            <h2 className="text-2xl font-medium" id="leave-portal-title">Leave the portal?</h2>
            <p className="mt-4 leading-relaxed opacity-65">
              You will be signed out on all devices and cannot sign in again without help from Norstec IT. Your membership history will be preserved.
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
                className="portal-button"
                disabled={pending}
                onClick={deactivate}
                type="button"
              >
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                  {pending ? "progress_activity" : "logout"}
                </span>
                {pending ? "Leaving…" : "Leave portal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
