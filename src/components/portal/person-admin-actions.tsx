"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { ActionCard } from "@/components/portal/action-card";
import {
  changePortalAccess,
  changePortalAdministrator,
  mergePeople,
  softDeletePerson,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { MemberAvatar } from "@/components/portal/member-avatar";
import { Toast } from "@/components/portal/toast";
import {
  hasNorstecEmail,
  NORSTEC_EMAIL_DOMAIN,
} from "@/lib/portal/norstec";

export type MergeCandidate = {
  avatarUrl?: string;
  email: string | null;
  id: number;
  name: string;
};

type AccessStatus = "unclaimed" | "active" | "suspended";

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
  norstecAccountStatus,
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
  /**
   * Portal access and the Norstec account move together, so suspending,
   * activating and deleting all say what they do to Google before they run.
   * Null when there is no Norstec account to say anything about.
   */
  norstecAccountStatus: "active" | "suspended" | null;
  personEmails: string[];
  personId: number;
  personName: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [adminConfirmation, setAdminConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
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

  function run(
    action: () => Promise<PortalManagementResult>,
    redirectTo?: string,
  ) {
    startTransition(async () => {
      const result = await action();
      setPendingAction(null);
      setAdminConfirmation("");
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
          sourcePersonId: mergeSource.id,
          targetPersonId: personId,
        }),
      );
      return;
    }
    if (pendingAction.kind === "delete") {
      // This page stops existing for a deleted person, so staying on it would
      // land on a 404. Manage people is where the decision was made from.
      run(() => softDeletePerson({ personId, reason }), "/admin/people");
    }
  }

  const accessLockReason = isSelf
    ? "You cannot change your own portal access. Ask another portal administrator."
    : accessStatus === "unclaimed"
      ? "This person has never signed in. Access opens the first time they do."
      : isPortalAdmin
        ? "Revoke the portal administrator role before suspending this person."
        : null;

  // Revoking the role stays available whatever the person's portal access is;
  // granting it needs an account that can actually sign in and use it — the
  // same two conditions `set_portal_administrator` enforces, in the same order
  // it checks them, so the button is never offered for a call that would come
  // straight back as `portal_access_required` or `norstec_domain_required`.
  const administratorLockReason = isSelf
    ? "You cannot change your own role. Another portal administrator has to do it."
    : isPortalAdmin
      ? null
      : accessStatus === "unclaimed"
        ? "This person has never signed in. They can be made a portal administrator once they do."
        : isSuspended
          ? "Portal access is suspended. Activate it again before making this person a portal administrator."
          : !hasNorstecEmail(personEmails)
            ? `Only people with a ${NORSTEC_EMAIL_DOMAIN} Google account can become portal administrators.`
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
                ? norstecAccountStatus === "suspended"
                  ? "Activating lets this person sign in again, and reactivates their Norstec account in Google Workspace."
                  : "Activating lets this person sign in again. Nothing else changes."
                : norstecAccountStatus === "active"
                  ? "Suspending signs the person out everywhere, blocks sign-in, and suspends their Norstec account in Google Workspace. Nothing is deleted and the change is reversible."
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
                className={`portal-button ${
                  isSuspended ? "portal-button-primary" : "portal-button-danger"
                }`}
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
            // The person being folded in is named right above the button, so
            // the direction is spelled out with the surviving name rather than
            // "this one" — which reads as whichever name is nearest.
            description={`Use this when the same person exists twice. The duplicate is folded into ${personName} and removed.`}
            title="Merge a duplicate"
          >
            <label className="block">
              <span className="section-label mb-2 block opacity-50">
                Duplicate person
              </span>
              <div className="relative">
                <input
                  className="portal-field w-full pr-10"
                  onChange={(event) => {
                    setMergeQuery(event.target.value);
                    setMergeSourceId(null);
                  }}
                  placeholder="Search name or email"
                  type="text"
                  value={mergeQuery}
                />
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
                  search
                </span>
              </div>
            </label>

            {mergeSource ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <MemberAvatar
                  name={mergeSource.name}
                  src={mergeSource.avatarUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {mergeSource.name}
                  </span>
                  <span className="block truncate text-sm opacity-55">
                    {mergeSource.email ?? "No email"}
                  </span>
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
              </div>
            ) : (
              matchingCandidates.length > 0 && (
                <ul className="mt-3 grid gap-1">
                  {matchingCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-moody hover:text-egg focus-visible:bg-moody focus-visible:text-egg focus-visible:outline-none"
                        onClick={() => setMergeSourceId(candidate.id)}
                        type="button"
                      >
                        <MemberAvatar
                          name={candidate.name}
                          src={candidate.avatarUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {candidate.name}
                          </span>
                          <span className="block truncate text-sm opacity-55">
                            {candidate.email ?? "No email"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}

            <button
              // A long name would otherwise push the pill past the card edge.
              className="portal-button mt-6 max-w-full"
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
              Merge into {personName}
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
            description="Portal administrators administer every organization, decide alumni access, suspend and restore portal access, grant and revoke both administrator roles, merge duplicates, delete and purge people, and read the audit log. Keep the group small."
            title="Portal administrator"
            tone="danger"
          >
            {administratorLockReason ? (
              <p className="text-sm leading-relaxed opacity-60">
                {administratorLockReason}
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
            description="Deleting ends their organization memberships and team roles. You can restore them from Deleted people within 30 days."
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
                    placeholder="Duplicate person, test account…"
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
              : `${personName} will be signed out of every device and blocked from signing in. Their record, memberships, and history are kept.`}
          </p>
          {!isSuspended && norstecAccountStatus === "active" && (
            <p className="mt-3">
              Their Norstec account is suspended in Google Workspace as well, so
              their mail and files stay in place but they cannot reach them.
            </p>
          )}
          {isSuspended && norstecAccountStatus === "suspended" && (
            <p className="mt-3">
              Their Norstec account is reactivated in Google Workspace at the
              same time, so their mail and files are reachable again.
            </p>
          )}
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "administrator" && (
        <ConfirmDialog
          busy={busy}
          confirmDisabled={
            pendingAction.grant &&
            adminConfirmation.trim().toLocaleLowerCase("en") !==
              personName.toLocaleLowerCase("en")
          }
          confirmIcon={
            pendingAction.grant ? "admin_panel_settings" : "person_remove"
          }
          confirmLabel={pendingAction.grant ? "Grant role" : "Revoke role"}
          danger
          onCancel={() => {
            setPendingAction(null);
            setAdminConfirmation("");
          }}
          onConfirm={confirmPendingAction}
          title={
            pendingAction.grant
              ? "Grant the portal administrator role?"
              : "Revoke the portal administrator role?"
          }
        >
          <p>
            {pendingAction.grant
              ? `${personName} will administer every organization, decide alumni access, change anyone's portal access and roles, merge duplicates, delete and purge people, and read the audit log.`
              : `${personName} keeps their portal access and memberships, but loses portal-wide administration.`}
          </p>
          {pendingAction.grant && (
            <label className="mt-5 block">
              <span className="section-label mb-2 block opacity-50">
                Type &quot;{personName}&quot; to confirm
              </span>
              <input
                className="portal-field"
                onChange={(event) => setAdminConfirmation(event.target.value)}
                type="text"
                value={adminConfirmation}
              />
            </label>
          )}
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "merge" && mergeSource && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="merge"
          confirmLabel="Merge"
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title="Merge these people?"
        >
          <p>
            Everything {mergeSource.name} owns — emails, sign-in accounts,
            memberships and their periods, team roles, requests, and audit
            history — moves to {personName}. The duplicate is then removed.
          </p>
          <p className="mt-3">
            {personName} is the person everything belongs to afterwards,
            keeping their own fields and roles. No membership role is promoted.
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
            Nothing is erased yet. Deleted people keeps them for 30 days, where
            you can restore them or purge their data for good.
          </p>
          {norstecAccountStatus === "active" && (
            <p className="mt-3">
              Their Norstec account is suspended in Google Workspace, never
              deleted. Removing it for good — and transferring their mail and
              files first — is done in the Google Admin console.
            </p>
          )}
        </ConfirmDialog>
      )}

    </>
  );
}
