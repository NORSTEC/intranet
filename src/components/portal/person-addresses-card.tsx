"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeContactEmail,
  removePersonEmail,
  unlinkPersonAccount,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ActionCard } from "@/components/portal/action-card";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

export type PersonAddress = {
  email: string;
  emailType: string;
  hasSignInAccount: boolean;
  isPrimary: boolean;
};

export type PersonSignInAccount = {
  authUserId: string;
  email: string;
  isOnboarding: boolean;
};

type PendingAction =
  | { kind: "remove-address"; email: string }
  | { kind: "unlink-account"; authUserId: string; email: string };

/**
 * The three repairs that used to have no interface at all: moving somebody's
 * contact address, releasing an address the Admin console has reassigned, and
 * removing a sign-in account on behalf of a person who cannot sign in to do it
 * themselves — which is what a duplicate holding a third account needs before
 * it can be merged.
 */
export function PersonAddressesCard({
  addresses,
  accounts,
  personId,
  personName,
}: {
  addresses: PersonAddress[];
  accounts: PersonSignInAccount[];
  personId: number;
  personName: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  function run(action: () => Promise<PortalManagementResult>) {
    startTransition(async () => {
      const result = await action();
      setPendingAction(null);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.kind === "remove-address") {
      const email = pendingAction.email;
      run(() => removePersonEmail({ email, personId }));
      return;
    }
    const authUserId = pendingAction.authUserId;
    run(() => unlinkPersonAccount({ authUserId, personId }));
  }

  return (
    <>
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          status={toast.status}
        />
      )}

      <ActionCard
        description="The contact address is what other members see. Addresses stay on a profile after a sign-in account is removed, so the portal keeps recognising the person; remove one only when it has been handed to somebody else."
        title="Email addresses"
      >
        <ul className="grid gap-3">
          {addresses.map((address) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
              key={address.email}
            >
              <span className="break-all font-medium">{address.email}</span>
              {address.isPrimary && (
                <span className="portal-pill border-beachball bg-beachball text-moody-static">
                  Contact
                </span>
              )}
              {address.hasSignInAccount && (
                <span className="text-sm opacity-55">signs in</span>
              )}
              <span className="ml-auto flex flex-wrap gap-2">
                {!address.isPrimary && (
                  <button
                    className="portal-button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        changeContactEmail({ email: address.email, personId }),
                      )
                    }
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[1.1rem]"
                    >
                      alternate_email
                    </span>
                    Make contact
                  </button>
                )}
                {!address.hasSignInAccount && addresses.length > 1 && (
                  <button
                    className="portal-button portal-button-danger"
                    disabled={busy}
                    onClick={() =>
                      setPendingAction({
                        email: address.email,
                        kind: "remove-address",
                      })
                    }
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[1.1rem]"
                    >
                      delete
                    </span>
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
          {addresses.length === 0 && (
            <li className="text-sm opacity-60">No addresses registered.</li>
          )}
        </ul>
      </ActionCard>

      <ActionCard
        description="Removing a sign-in account leaves the address on the profile and ends that account's sessions. A profile has to keep one account, and two profiles cannot be merged while they hold three between them."
        title="Sign-in accounts"
      >
        <ul className="grid gap-3">
          {accounts.map((account) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
              key={account.authUserId}
            >
              <span className="break-all font-medium">{account.email}</span>
              {account.isOnboarding && (
                <span className="text-sm opacity-55">onboarding</span>
              )}
              {accounts.length > 1 && (
                <button
                  className="portal-button ml-auto"
                  disabled={busy}
                  onClick={() =>
                    setPendingAction({
                      authUserId: account.authUserId,
                      email: account.email,
                      kind: "unlink-account",
                    })
                  }
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
              )}
            </li>
          ))}
          {accounts.length === 0 && (
            <li className="text-sm opacity-60">No sign-in accounts.</li>
          )}
        </ul>
      </ActionCard>

      {pendingAction?.kind === "remove-address" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="delete"
          confirmLabel="Remove address"
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          danger
          title="Remove this address?"
        >
          The portal will stop recognising {personName} by{" "}
          <span className="font-medium">{pendingAction.email}</span>, and the
          address becomes available to whoever holds it next. Do this when
          Google has reassigned it, not to tidy a profile.
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "unlink-account" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="link_off"
          confirmLabel="Remove account"
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          danger
          title="Remove this sign-in account?"
        >
          <span className="font-medium">{pendingAction.email}</span> will no
          longer sign anybody in to {personName}&rsquo;s profile, and its
          sessions end immediately. The address stays on the profile.
        </ConfirmDialog>
      )}
    </>
  );
}
