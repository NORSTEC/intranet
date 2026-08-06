"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { unlinkLoginAccount } from "@/app/(portal)/profile/actions";

export type LinkedLoginAccount = {
  email: string;
  emailType: "organization" | "personal" | "unknown";
  id: string;
  isCurrentSession: boolean;
};

function accountTypeLabel(account: LinkedLoginAccount) {
  if (account.emailType === "organization") return "Organization account";
  if (account.emailType === "personal") return "Personal account";
  return "Google account";
}

export function LoginAccountsSettings({
  accounts,
}: {
  accounts: LinkedLoginAccount[];
}) {
  const router = useRouter();
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedLoginAccount | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [unlinkPending, startUnlinkTransition] = useTransition();
  const canLinkAlternativeAccount = accounts.length < 2;
  const hasOnlyOneOrganizationAccount =
    accounts.length === 1 && accounts[0].emailType === "organization";

  useEffect(() => {
    if (!unlinkTarget) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setUnlinkTarget(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [unlinkTarget]);

  function linkGoogleAccount() {
    if (!canLinkAlternativeAccount) return;

    setIsLinking(true);
    setError(null);
    window.location.assign("/auth/account-link/start?mode=add_account");
  }

  function unlinkAccount(account: LinkedLoginAccount) {
    setError(null);
    startUnlinkTransition(async () => {
      const result = await unlinkLoginAccount(account.id);
      if (!result.ok) {
        setError(result.message);
      }
      setUnlinkTarget(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="login-accounts-heading" className="mt-20">
      <h2 className="text-h2" id="login-accounts-heading">
        Sign-in accounts
      </h2>

      {hasOnlyOneOrganizationAccount && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
          If you only use an organization Google account to sign in, you may lose access to the portal if your organization disables that account. Add an alternative Google account to keep access.
        </p>
      )}

      {accounts.length > 1 && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
          You can use either Google account to sign in to this profile.
        </p>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {accounts.map((account) => {
          // Every account is removable once a second one exists: the address
          // survives the unlink, and no account carries the contact address
          // with it.
          const canUnlink = accounts.length > 1;
          return (
            <article
              className="portal-surface flex flex-col px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8"
              key={account.id}
            >
              {/* Reserved so both cards align even though only one is in use. */}
              <div className="min-h-8">
                {account.isCurrentSession && (
                  <span className="portal-pill w-fit border-beachball bg-beachball text-moody-static">
                    Signed in now
                  </span>
                )}
              </div>
              <p className="mt-6 text-xl font-medium break-all">{account.email}</p>
              <p className="mt-2 text-sm opacity-55">{accountTypeLabel(account)}</p>

              {canUnlink && (
                <div className="mt-7">
                  <button
                    className="portal-button"
                    disabled={unlinkPending}
                    onClick={() => setUnlinkTarget(account)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[1.1rem]"
                    >
                      link_off
                    </span>
                    Remove account
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {canLinkAlternativeAccount && (
        <button
          className="portal-button mt-6"
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

      {unlinkTarget && (
        <div
          aria-labelledby="unlink-account-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          role="alertdialog"
        >
          <div className="portal-surface w-full max-w-md p-7 sm:p-8">
            <h2 className="text-2xl font-medium" id="unlink-account-title">
              Remove this sign-in account?
            </h2>
            <p className="mt-4 leading-relaxed opacity-65">
              <span className="font-medium">{unlinkTarget.email}</span> will no longer sign you in to this profile. The address stays on your profile, so people can still reach you there and the portal still recognises you by it. An active organization membership that rests on this address has to be ended by an organization administrator first.
            </p>
            {unlinkTarget.isCurrentSession && (
              <p className="mt-3 leading-relaxed opacity-65">
                You are signed in with this account right now, so you will be signed out. Sign back in with your other Google account.
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                autoFocus
                className="portal-button"
                disabled={unlinkPending}
                onClick={() => setUnlinkTarget(null)}
                type="button"
              >
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                  close
                </span>
                Cancel
              </button>
              <button
                className="portal-button portal-button-danger"
                disabled={unlinkPending}
                onClick={() => unlinkAccount(unlinkTarget)}
                type="button"
              >
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                  {unlinkPending ? "progress_activity" : "link_off"}
                </span>
                {unlinkPending ? "Removing…" : "Remove account"}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
