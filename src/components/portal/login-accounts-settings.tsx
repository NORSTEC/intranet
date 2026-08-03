"use client";

import { useState, useTransition } from "react";
import { deactivatePortalAccess } from "@/app/(portal)/profile/actions";

export type LinkedLoginAccount = {
  email: string;
  emailType: "organization" | "personal" | "unknown";
  id: string;
  isPrimary: boolean;
};

function accountTypeLabel(account: LinkedLoginAccount) {
  if (account.emailType === "organization") return "Organization account";
  if (account.emailType === "personal") return "Personal account";
  return "Google account";
}

export function LoginAccountsSettings({
  accounts,
  canLeavePortal,
}: {
  accounts: LinkedLoginAccount[];
  canLeavePortal: boolean;
}) {
  const [isLinking, setIsLinking] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leavePending, startLeaveTransition] = useTransition();
  const canLinkAlternativeAccount = accounts.length < 2;
  const hasOnlyOneOrganizationAccount =
    accounts.length === 1 && accounts[0].emailType === "organization";

  function linkGoogleAccount() {
    if (!canLinkAlternativeAccount) return;

    setIsLinking(true);
    setError(null);
    window.location.assign("/auth/account-link/start?mode=add_account");
  }

  function leavePortal() {
    setError(null);
    startLeaveTransition(async () => {
      const result = await deactivatePortalAccess();
      if (result && !result.ok) {
        setError(result.message);
        setConfirmingLeave(false);
      }
    });
  }

  return (
    <section
      aria-labelledby="login-accounts-heading"
      className="mt-20 max-w-3xl"
    >
      <h2 className="text-h2" id="login-accounts-heading">
        Sign-in accounts
      </h2>

      {hasOnlyOneOrganizationAccount && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-65">
          If you only use an organization Google account to sign in, you may lose access to the portal if your organization disables that account. Add an alternative Google account to keep access.
        </p>
      )}

      {accounts.length > 1 && (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-65">
          You can use either Google account to sign in to this profile.
        </p>
      )}

      <div className="mt-5 divide-y divide-moody border-y border-moody">
        {accounts.map((account) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            key={account.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{account.email}</p>
              <p className="mt-1 text-xs opacity-50">{accountTypeLabel(account)}</p>
            </div>
            {account.isPrimary && (
              <span className="rounded-full bg-sky px-3 py-1 text-xs font-medium text-moody-static">
                Primary
              </span>
            )}
          </div>
        ))}
      </div>

      {canLinkAlternativeAccount && (
        <button
          className="portal-button mt-5"
          disabled={isLinking}
          onClick={linkGoogleAccount}
          type="button"
        >
          <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
            {isLinking ? "progress_activity" : "add_link"}
          </span>
          {isLinking ? "Opening Google…" : "Add alternative Google account"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-[#a33b2b]" role="alert">{error}</p>}

      {canLeavePortal && (
        <div className="mt-10 max-w-3xl border-t border-moody pt-7">
          <p className="max-w-2xl text-sm leading-relaxed opacity-65">
            Leaving disables future portal sign-in while preserving required membership history. It is not a GDPR deletion.
          </p>
          <button
            className="portal-button mt-5"
            onClick={() => setConfirmingLeave(true)}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">logout</span>
            Leave portal
          </button>
        </div>
      )}

      {confirmingLeave && (
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
                disabled={leavePending}
                onClick={() => setConfirmingLeave(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="portal-button"
                disabled={leavePending}
                onClick={leavePortal}
                type="button"
              >
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                  {leavePending ? "progress_activity" : "logout"}
                </span>
                {leavePending ? "Leaving…" : "Leave portal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
