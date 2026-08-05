export type PortalAccessStatusValue = "unclaimed" | "active" | "suspended";

export type RegistryAccessLevel =
  | "portal_admin"
  | "organization_admin"
  | "member"
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
  organization_admin: "Organization admin",
  portal_admin: "Portal admin",
  suspended: "Suspended",
};

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
