"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setNorstecAccountSuspension } from "@/app/(portal)/admin/actions";
import { ActionCard } from "@/components/portal/action-card";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

export type NorstecAccount = {
  accountEmail: string | null;
  adminUrl: string | null;
  lastSyncedAt: string | null;
  status: "unknown" | "active" | "suspended";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * The person's identity in the norstec.no Google Workspace: their mail, their
 * files, and the Google account the portal itself accepts a sign-in from.
 *
 * The portal does not create these and does not delete them. It reads the
 * directory, and it suspends — which blocks every Google sign-in while leaving
 * the mailbox and the files exactly where they are, and can be undone. Removing
 * an account for good takes the data with it, so that decision belongs in the
 * Admin console, one link away, where it can be transferred first.
 */
export function NorstecAccountCard({
  account,
  personId,
  personName,
  workspaceConfigured,
}: {
  account: NorstecAccount | null;
  personId: number;
  personName: string;
  workspaceConfigured: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  const isSuspended = account?.status === "suspended";

  function confirmSuspension() {
    startTransition(async () => {
      const result = await setNorstecAccountSuspension({
        personId,
        suspended: !isSuspended,
      });
      setConfirming(false);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      router.refresh();
    });
  }

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <section aria-labelledby="norstec-account-heading" className="mt-16">
        <h2 className="text-h2" id="norstec-account-heading">
          Norstec account
        </h2>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
          <ActionCard
            description={
              account
                ? "Their account in the norstec.no Google Workspace. Suspending it suspends it both in this intranet and in Google Workspace."
                : "No account in the norstec.no Google Workspace is linked to this person."
            }
            title="Google Workspace"
          >
            {!workspaceConfigured ? (
              <p className="text-sm leading-relaxed opacity-60">
                Google Workspace is not configured on this server.
              </p>
            ) : !account ? (
              <p className="text-sm leading-relaxed opacity-60">
                Accounts are created in the Google Admin console. Once one
                exists on this person&apos;s address, syncing the directory from
                Google accounts links it here.
              </p>
            ) : (
              <div className="grid gap-5">
                <dl className="grid gap-5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="section-label opacity-45">Address</dt>
                    <dd className="mt-2 font-medium break-words">
                      {account.accountEmail ?? "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="section-label opacity-45">Suspended</dt>
                    <dd className="mt-2 font-medium">
                      {isSuspended ? "Yes" : "No"}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={`portal-button ${
                      isSuspended ? "portal-button-primary" : "portal-button-danger"
                    }`}
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[1.1rem]"
                    >
                      {busy
                        ? "progress_activity"
                        : isSuspended
                          ? "lock_open"
                          : "lock"}
                    </span>
                    {isSuspended ? "Activate account" : "Suspend account"}
                  </button>
                  {account.adminUrl && (
                    <a
                      className="portal-button"
                      href={account.adminUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[1.1rem]"
                      >
                        open_in_new
                      </span>
                      Open in Admin console
                    </a>
                  )}
                </div>
                {/* Read from Google at the last sync, not now — so how old the
                    answer is belongs on the card. As its own sentence, though:
                    hung off the value it read as a badge, which is not a thing
                    this intranet does anywhere else. */}
                {account.lastSyncedAt && (
                  <p className="text-sm leading-relaxed opacity-55">
                    Last synced from Google {formatDate(account.lastSyncedAt)}.
                  </p>
                )}
              </div>
            )}
          </ActionCard>
        </div>
      </section>

      {confirming && (
        <ConfirmDialog
          busy={busy}
          confirmIcon={isSuspended ? "lock_open" : "lock"}
          confirmLabel={isSuspended ? "Activate" : "Suspend"}
          danger={!isSuspended}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmSuspension}
          title={
            isSuspended
              ? "Activate this Norstec account?"
              : "Suspend this Norstec account?"
          }
        >
          <p>
            {isSuspended
              ? `${personName} can sign in to Google and to the intranet again, and reaches their mail and files as before.`
              : `${personName} is signed out of Google everywhere and cannot sign in — to Google or to this intranet. Their mail and files are kept and nothing is deleted.`}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
