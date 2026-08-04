"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  setMembershipRole,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

// Only live memberships reach this component. Ending and reactivating a
// membership belongs to Member status, so an ended one has nothing to offer
// here beyond noise.
export type PersonMembership = {
  id: number;
  organizationName: string;
  periods: Array<{ endsOn: string | null; startsOn: string }>;
  role: "member" | "organization_admin";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function PersonOrganizationRoles({
  canGrantAdmin,
  children,
  isDeleted,
  isSelf,
  memberships,
  personId,
  personName,
}: {
  canGrantAdmin: boolean;
  children?: ReactNode;
  isDeleted: boolean;
  isSelf: boolean;
  memberships: PersonMembership[];
  personId: number;
  personName: string;
}) {
  const router = useRouter();
  const [pendingMembership, setPendingMembership] =
    useState<PersonMembership | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  function run(action: () => Promise<PortalManagementResult>) {
    startTransition(async () => {
      const result = await action();
      setPendingMembership(null);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  function confirmRoleChange() {
    if (!pendingMembership) return;
    const membership = pendingMembership;
    run(() =>
      setMembershipRole({
        membershipId: membership.id,
        personId,
        role:
          membership.role === "organization_admin" ? "member" : "organization_admin",
      }),
    );
  }

  const grantingAdmin = pendingMembership?.role === "member";

  return (
    <section aria-labelledby="person-organizations-heading" className="mt-16">
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <h2 className="text-h2" id="person-organizations-heading">
        Organizations
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-55">
        An organization administrator manages that organization&apos;s members,
        teams and settings. The role only applies to the organization it is
        given in.
      </p>

      {memberships.length > 0 ? (
        <ul className="mt-8 grid gap-4">
          {memberships.map((membership) => (
            <li
              className="portal-surface flex flex-wrap items-start justify-between gap-x-8 gap-y-5 p-6 sm:p-7"
              key={membership.id}
            >
              <div className="min-w-0">
                <h3 className="text-h3">{membership.organizationName}</h3>
                <p className="mt-2 font-medium">
                  {membership.role === "organization_admin"
                    ? "Organization administrator"
                    : "Member"}
                </p>
                <ul className="mt-3 grid gap-1 text-sm opacity-55">
                  {[...membership.periods]
                    .sort((left, right) =>
                      right.startsOn.localeCompare(left.startsOn),
                    )
                    .map((period) => (
                      <li key={`${membership.id}-${period.startsOn}`}>
                        {formatDate(period.startsOn)} —{" "}
                        {period.endsOn ? formatDate(period.endsOn) : "present"}
                      </li>
                    ))}
                </ul>
              </div>

              {/* Removing the role stays available whatever the person's
                  portal access is; granting it needs an account that can
                  actually sign in and use it. */}
              {!isDeleted &&
                !isSelf &&
                (membership.role === "organization_admin" || canGrantAdmin) && (
                <button
                  className="portal-button whitespace-nowrap"
                  disabled={busy}
                  onClick={() => setPendingMembership(membership)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[1.1rem]"
                  >
                    {membership.role === "organization_admin"
                      ? "person_remove"
                      : "shield_person"}
                  </span>
                  {membership.role === "organization_admin"
                    ? "Remove administrator"
                    : "Make administrator"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-sm opacity-55">
          This person belongs to no active organization.
        </p>
      )}

      {memberships.length > 0 &&
        (isSelf ? (
          <p className="mt-5 text-sm leading-relaxed opacity-55">
            You cannot change your own organization roles. Ask another portal
            administrator.
          </p>
        ) : (
          !canGrantAdmin && (
            <p className="mt-5 text-sm leading-relaxed opacity-55">
              Only someone with active portal access can administer an
              organization.
            </p>
          )
        ))}

      {children}

      {pendingMembership && (
        <ConfirmDialog
          busy={busy}
          confirmIcon={grantingAdmin ? "shield_person" : "person_remove"}
          confirmLabel={grantingAdmin ? "Make administrator" : "Remove administrator"}
          danger={!grantingAdmin}
          onCancel={() => setPendingMembership(null)}
          onConfirm={confirmRoleChange}
          title={
            grantingAdmin
              ? "Make this person an organization administrator?"
              : "Remove the organization administrator role?"
          }
        >
          <p>
            {grantingAdmin
              ? `${personName} will manage members, teams and settings for ${pendingMembership.organizationName}.`
              : `${personName} stays a member of ${pendingMembership.organizationName} but can no longer administer it.`}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
