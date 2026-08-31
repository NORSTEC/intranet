"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { unlinkLoginAccount } from "@/app/(portal)/profile/actions";
import { Toast } from "@/components/portal/toast";
import { PRIVACY_CONTACT_EMAIL } from "@/lib/legal/privacy";

export type LinkedLoginAccount = {
  /** Why this account cannot be removed, already in the portal's words. */
  blockedReason: string | null;
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

/**
 * A personal address is the person's own, so removing the account takes it
 * with them and the next sign-in starts somewhere new — which is what people
 * already believe "remove this account" does. An organization address belongs
 * to the organization and stays, the way a directory-provisioned attribute
 * does everywhere else. The database enforces the same split; this only
 * decides which sentence to show.
 */
function releasesAddress(account: LinkedLoginAccount) {
  return account.emailType === "personal";
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
  const [error, setError] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [unlinkPending, startUnlinkTransition] = useTransition();
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
    setIsLinking(true);
    setError(null);
    router.push("/auth/account-link/start?mode=add_account");
  }

  function unlinkAccount(account: LinkedLoginAccount) {
    setError(null);
    startUnlinkTransition(async () => {
      const result = await unlinkLoginAccount(
        account.id,
        releasesAddress(account),
      );
      if (!result.ok) {
        setError({ id: Date.now(), message: result.message });
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
          If you only use an organization Google account to sign in, you may lose access to the intranet if your organization disables that account. Add an alternative Google account to keep access.
        </p>
      )}

      {accounts.length > 1 && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
          You can use any listed Google account to sign in to this profile. The
          intranet allows one per organization domain and one personal account.
        </p>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {accounts.map((account) => {
          // The database answers this, because the rule reads organization
          // domains a browser cannot see. Showing the button and explaining
          // afterwards is what made removing an account feel arbitrary.
          const canUnlink = !account.blockedReason;
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

              <div className="mt-7">
                {canUnlink ? (
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
                    {releasesAddress(account)
                      ? "Remove account and address"
                      : "Remove account"}
                  </button>
                ) : (
                  <p className="text-sm leading-relaxed opacity-60">
                    {account.blockedReason}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <button
        className="portal-button mt-6"
        disabled={isLinking}
        onClick={linkGoogleAccount}
        type="button"
      >
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          {isLinking ? "progress_activity" : "add_link"}
        </span>
        {isLinking ? "Opening Google…" : "Add another Google account"}
      </button>
      {error && (
        <Toast key={error.id} message={error.message} status="error" />
      )}

      {unlinkTarget && (
        <div
          aria-labelledby="unlink-account-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          role="alertdialog"
        >
          <div className="portal-surface w-full max-w-md p-7 sm:p-8">
            <h2 className="text-2xl font-medium" id="unlink-account-title">
              {releasesAddress(unlinkTarget)
                ? "Remove this account and its address?"
                : "Remove this sign-in account?"}
            </h2>
            <p className="mt-4 leading-relaxed opacity-65">
              {releasesAddress(unlinkTarget) ? (
                <>
                  <span className="font-medium">{unlinkTarget.email}</span> stops
                  signing you in and leaves your profile altogether. Nobody can
                  reach you there through the intranet afterwards, and signing in
                  with this Google account again starts a new profile instead of
                  bringing you back to this one.
                </>
              ) : (
                <>
                  <span className="font-medium">{unlinkTarget.email}</span> will
                  no longer sign you in to this profile. The address belongs to
                  the organization, so it stays — people can still reach you
                  there, and signing in with this Google account again brings you
                  back to this same profile rather than starting a new one. An
                  active organization membership that rests on this address has
                  to be ended by an organization administrator first.
                </>
              )}
            </p>
            {unlinkTarget.isCurrentSession && (
              <p className="mt-3 leading-relaxed opacity-65">
                You are signed in with this account right now, so you will be signed out. Sign back in with your other Google account.
              </p>
            )}
            {!releasesAddress(unlinkTarget) && (
              <p className="mt-3 leading-relaxed opacity-65">
                Need this address moved to another profile, or off your profile
                entirely? Write to{" "}
                <a
                  className="legal-link"
                  href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                >
                  {PRIVACY_CONTACT_EMAIL}
                </a>
                .
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
                {unlinkPending
                  ? "Removing…"
                  : releasesAddress(unlinkTarget)
                    ? "Remove account and address"
                    : "Remove account"}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
