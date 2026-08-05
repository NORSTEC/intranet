export type PortalAccessStatusValue = "unclaimed" | "active" | "suspended";

export type RegistryAccessLevel =
  | "portal_admin"
  | "organization_admin"
  | "member"
  | "none"
  | "suspended";

export type RegistryPersonStatus = "active" | "alumni" | "none" | "deleted";

// Kept out of the registry component on purpose: a server component that
// imports a value from a "use client" module receives a client reference
// rather than the object itself, which silently renders nothing.
export const accessLabels: Record<PortalAccessStatusValue, string> = {
  active: "Active",
  suspended: "Suspended",
  unclaimed: "Never signed in",
};

// The vocabulary Manage people is read in. The person page describes the same
// person, so both have to say the same words — they read these.
export const accessLevelLabels: Record<RegistryAccessLevel, string> = {
  member: "Member",
  none: "No access",
  organization_admin: "Organization admin",
  portal_admin: "Portal admin",
  suspended: "Suspended",
};

/**
 * What a person may do once inside the portal — never whether they may get in
 * at all, which is `portal_access_status` and reads through
 * {@link accessLabels}. Read from here by both Manage people and the person
 * page, for the same reason {@link derivePersonStatus} is.
 */
export function deriveAccessLevel({
  hasActiveMembership,
  hasAlumniAccess,
  isOrganizationAdmin,
  isPortalAdmin,
  isSuspended,
}: {
  hasActiveMembership: boolean;
  hasAlumniAccess: boolean;
  isOrganizationAdmin: boolean;
  isPortalAdmin: boolean;
  isSuspended: boolean;
}): RegistryAccessLevel {
  if (isSuspended) return "suspended";
  if (isPortalAdmin) return "portal_admin";
  if (isOrganizationAdmin) return "organization_admin";
  // An alumnus reads the portal on the same terms a member does, so alumni
  // access is member-level access. Without it, and without a membership that
  // is still running, there is nothing to reach — "Member" was only ever the
  // fallback branch talking.
  if (hasActiveMembership || hasAlumniAccess) return "member";
  return "none";
}

export const personStatusLabels: Record<RegistryPersonStatus, string> = {
  active: "Active",
  alumni: "Alumni",
  deleted: "Deleted",
  none: "No membership",
};

/**
 * The one place a person's status is decided. Manage people and the person
 * page describe the same person, so they read it from here rather than each
 * repeating the rules — the two drifted apart once already, and alumni access
 * granted without any membership row rendered as "No membership".
 */
export function derivePersonStatus({
  activeMembershipCount,
  deletedAt,
  endedMembershipCount,
  hasAlumniAccess,
}: {
  activeMembershipCount: number;
  deletedAt: string | null;
  endedMembershipCount: number;
  hasAlumniAccess: boolean;
}): RegistryPersonStatus {
  if (deletedAt) return "deleted";
  if (activeMembershipCount > 0) return "active";
  // Alumni access granted by a portal administrator makes someone an alumnus
  // even when no membership was ever recorded for them.
  if (endedMembershipCount > 0 || hasAlumniAccess) return "alumni";
  return "none";
}
