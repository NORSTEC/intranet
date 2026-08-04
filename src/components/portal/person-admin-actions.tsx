"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  changePortalAccess,
  changePortalAdministrator,
  mergePeople,
  softDeletePerson,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

export type MergeCandidate = {
  email: string | null;
  id: number;
  name: string;
};

type AccessStatus = "unclaimed" | "active" | "suspended";

function ActionCard({
  children,
  description,
  title,
  tone = "default",
}: {
  children: ReactNode;
  description: string;
  title: string;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={`portal-surface flex flex-col p-6 sm:p-7${
        tone === "danger" ? " border-copper" : ""
      }`}
    >
      <h3 className="text-h3">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-60">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

type PendingAction =
  | { kind: "access" }
  | { kind: "administrator"; grant: boolean }
  | { kind: "merge" }
  | { kind: "delete" };

export function PersonAdminActions({
  accessStatus,
  children,
  isPortalAdmin,
  isSelf,
  mergeCandidates,
  personEmails,
  personId,
  personName,
}: {
  accessStatus: AccessStatus;
  /** Rendered between Administration and Danger zone. */
  children?: ReactNode;
  isPortalAdmin: boolean;
  isSelf: boolean;
  mergeCandidates: MergeCandidate[];
  personEmails: string[];
  personId: number;
  personName: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [primaryEmail, setPrimaryEmail] = useState<string>(
    personEmails[0] ?? "",
  );
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  const isSuspended = accessStatus === "suspended";
  const mergeSource =
    mergeCandidates.find((candidate) => candidate.id === mergeSourceId) ?? null;

  const matchingCandidates = useMemo(() => {
    const normalizedQuery = mergeQuery.trim().toLocaleLowerCase("en");
    if (!normalizedQuery) return [];
    return mergeCandidates
      .filter(
        (candidate) =>
          candidate.name.toLocaleLowerCase("en").includes(normalizedQuery) ||
          candidate.email?.toLocaleLowerCase("en").includes(normalizedQuery),
      )
      .slice(0, 6);
  }, [mergeCandidates, mergeQuery]);

  const primaryEmailOptions = useMemo(() => {
    const options = [...personEmails];
    if (mergeSource?.email && !options.includes(mergeSource.email)) {
      options.push(mergeSource.email);
    }
    return options;
  }, [mergeSource, personEmails]);

  function run(
    action: () => Promise<PortalManagementResult>,
    redirectTo?: string,
  ) {
    startTransition(async () => {
      const result = await action();
      setPendingAction(null);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (!result.ok) return;
      setReason("");
      setMergeQuery("");
      setMergeSourceId(null);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  function confirmPendingAction() {
    if (!pendingAction) return;

    if (pendingAction.kind === "access") {
      const status = isSuspended ? "active" : "suspended";
      run(() => changePortalAccess({ personId, status }));
      return;
    }
    if (pendingAction.kind === "administrator") {
      const grant = pendingAction.grant;
      run(() =>
        changePortalAdministrator({ isAdministrator: grant, personId }),
      );
      return;
    }
    if (pendingAction.kind === "merge") {
      if (!mergeSource) return;
      run(() =>
        mergePeople({
          primaryEmail: primaryEmail || null,
          sourcePersonId: mergeSource.id,
          targetPersonId: personId,
        }),
      );
      return;
    }
    if (pendingAction.kind === "delete") {
      // This page stops existing for a deleted person, so staying on it would
      // land on a 404. Manage users is where the decision was made from.
      run(() => softDeletePerson({ personId, reason }), "/admin/people");
    }
  }

  const accessLockReason = isSelf
    ? "You cannot change your own portal access. Ask another portal administrator."
    : accessStatus === "unclaimed"
      ? "This profile has never been signed in to. Access opens the first time they sign in."
      : isPortalAdmin
        ? "Revoke the portal administrator role before suspending this person."
        : null;

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <section aria-labelledby="person-administration-heading" className="mt-16">
        <h2 className="text-h2" id="person-administration-heading">
          Administration
        </h2>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
          <ActionCard
            description={
              isSuspended
                ? "Activating lets this person sign in again. Nothing else changes."
                : "Suspending signs the person out everywhere and blocks sign-in. Nothing is deleted and the change is reversible."
            }
            title="Portal access"
          >
            {accessLockReason ? (
              <p className="text-sm leading-relaxed opacity-60">
                {accessLockReason}
              </p>
            ) : (
              <button
                className={`portal-button${isSuspended ? "" : " portal-button-danger"}`}
                disabled={busy}
                onClick={() => setPendingAction({ kind: "access" })}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  {isSuspended ? "lock_open" : "lock"}
                </span>
                {isSuspended ? "Activate portal access" : "Suspend portal access"}
              </button>
            )}
          </ActionCard>

          <ActionCard
            description="Use this when the same person exists twice."
            title="Merge a duplicate"
          >
            <label className="block">
                  <span className="section-label mb-2 block opacity-50">
                    Duplicate profile
                  </span>
                  <input
                    className="portal-field"
                    onChange={(event) => {
                      setMergeQuery(event.target.value);
                      setMergeSourceId(null);
                    }}
                    placeholder="Search name or email"
                    type="search"
                    value={mergeQuery}
                  />
                </label>

                {mergeSource ? (
                  <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <span className="font-medium">{mergeSource.name}</span>
                    <span className="opacity-55">
                      {mergeSource.email ?? "No email"}
                    </span>
                    <button
                      className="portal-pill"
                      onClick={() => setMergeSourceId(null)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[1rem]"
                      >
                        edit
                      </span>
                      Change
                    </button>
                  </p>
                ) : (
                  matchingCandidates.length > 0 && (
                    <ul className="mt-3 grid gap-1">
                      {matchingCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            className="w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-moody/10"
                            onClick={() => setMergeSourceId(candidate.id)}
                            type="button"
                          >
                            <span className="block font-medium">
                              {candidate.name}
                            </span>
                            <span className="block opacity-55">
                              {candidate.email ?? "No email"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                )}

                {mergeSource && primaryEmailOptions.length > 0 && (
                  <label className="mt-5 block">
                    <span className="section-label mb-2 block opacity-50">
                      Primary address after the merge
                    </span>
                    <select
                      className="portal-field"
                      onChange={(event) => setPrimaryEmail(event.target.value)}
                      value={primaryEmail}
                    >
                      {primaryEmailOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  className="portal-button mt-5"
                  disabled={busy || !mergeSource}
                  onClick={() => setPendingAction({ kind: "merge" })}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[1.1rem]"
                  >
                    merge
                  </span>
                  Merge into this profile
                </button>
          </ActionCard>
        </div>
      </section>

      {children}

      <section aria-labelledby="person-danger-heading" className="mt-16">
        <h2 className="text-h2" id="person-danger-heading">
          Danger zone
        </h2>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
          <ActionCard
            description="Portal administrators manage every organization, decide alumni access, and can delete people. Keep the group small."
            title="Portal administrator"
            tone="danger"
          >
            {isSelf ? (
              <p className="text-sm leading-relaxed opacity-60">
                You cannot change your own role. Another portal administrator
                has to do it.
              </p>
            ) : (
              <button
                className={`portal-button${isPortalAdmin ? "" : " portal-button-danger"}`}
                disabled={busy}
                onClick={() =>
                  setPendingAction({
                    grant: !isPortalAdmin,
                    kind: "administrator",
                  })
                }
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  {isPortalAdmin ? "person_remove" : "admin_panel_settings"}
                </span>
                {isPortalAdmin
                  ? "Revoke portal administrator"
                  : "Grant portal administrator"}
              </button>
            )}
          </ActionCard>

          <ActionCard
            description="Deleting ends their organization memberships and team roles. You can restore them from Deleted users within 30 days."
            title="Delete this person"
            tone="danger"
          >
            {isSelf ? (
              <p className="text-sm leading-relaxed opacity-60">
                You cannot delete your own profile.
              </p>
            ) : isPortalAdmin ? (
              <p className="text-sm leading-relaxed opacity-60">
                Revoke the portal administrator role before deleting this
                person.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="section-label mb-2 block opacity-50">
                    Reason (optional)
                  </span>
                  <input
                    className="portal-field"
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Duplicate profile, test account…"
                    type="text"
                    value={reason}
                  />
                </label>
                <button
                  className="portal-button portal-button-danger mt-5"
                  disabled={busy}
                  onClick={() => setPendingAction({ kind: "delete" })}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[1.1rem]"
                  >
                    delete
                  </span>
                  Delete
                </button>
              </>
            )}
          </ActionCard>
        </div>
      </section>

      {pendingAction?.kind === "access" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon={isSuspended ? "lock_open" : "lock"}
          confirmLabel={isSuspended ? "Activate" : "Suspend"}
          danger={!isSuspended}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title={
            isSuspended ? "Activate portal access?" : "Suspend portal access?"
          }
        >
          <p>
            {isSuspended
              ? `${personName} will be able to sign in again.`
              : `${personName} will be signed out of every device and blocked from signing in. Their profile, memberships, and history are kept.`}
          </p>
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "administrator" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon={
            pendingAction.grant ? "admin_panel_settings" : "person_remove"
          }
          confirmLabel={pendingAction.grant ? "Grant role" : "Revoke role"}
          danger
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title={
            pendingAction.grant
              ? "Grant the portal administrator role?"
              : "Revoke the portal administrator role?"
          }
        >
          <p>
            {pendingAction.grant
              ? `${personName} will administer every organization, decide alumni access, and be able to delete people.`
              : `${personName} keeps their portal access and memberships, but loses portal-wide administration.`}
          </p>
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "merge" && mergeSource && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="merge"
          confirmLabel="Merge"
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title="Merge these profiles?"
        >
          <p>
            Everything {mergeSource.name} owns — emails, sign-in accounts,
            memberships and their periods, team roles, requests, and audit
            history — moves to {personName}. The duplicate profile is then
            removed.
          </p>
          <p className="mt-3">
            The portal administrator role never carries over, and no membership
            role is promoted.
          </p>
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "delete" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="delete"
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title="Delete this person?"
        >
          <p>
            {personName} disappears from the directory, every team page, and
            every administrator&apos;s view, and is signed out everywhere.
          </p>
          <p className="mt-3">
            Nothing is erased yet. Deleted users keeps them for 30 days, where
            you can restore them or purge their data for good.
          </p>
        </ConfirmDialog>
      )}

    </>
  );
}
