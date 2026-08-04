import "server-only";

import type { RegistryPerson } from "@/components/portal/portal-people-registry";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type PersonRow = {
  alumni_access_granted_at: string | null;
  avatar_path: string | null;
  deleted_at: string | null;
  full_name: string | null;
  id: number;
  memberships: Array<{
    role: string;
    status: string;
    organizations: { name: string } | Array<{ name: string }> | null;
  }>;
  person_emails: Array<{ email: string; is_primary: boolean }>;
  portal_access_status: string;
  portal_accounts: Array<{ last_seen_at: string }>;
  // portal_administrators.person_id is both the foreign key and the primary
  // key, so PostgREST embeds it as a single row rather than a collection.
  portal_administrators: { person_id: number } | null;
};

function organizationName(
  organizations: { name: string } | Array<{ name: string }> | null,
) {
  if (!organizations) return null;
  return Array.isArray(organizations)
    ? (organizations[0]?.name ?? null)
    : organizations.name;
}

/**
 * Every person in the portal, deleted ones included. Row level security
 * already limits this to portal administrators, who are the only role that
 * may see a person outside their own organizations — and the only role that
 * may see a deleted one at all.
 */
export async function loadRegistryPeople(): Promise<RegistryPerson[]> {
  const supabase = await createClient();

  const peopleResult = await supabase
    .from("people")
    .select(
      "id, full_name, avatar_path, portal_access_status, deleted_at, alumni_access_granted_at, person_emails (email, is_primary), memberships (role, status, organizations (name)), portal_accounts (last_seen_at), portal_administrators!portal_administrators_person_id_fkey (person_id)",
    )
    .order("full_name", { ascending: true, nullsFirst: false });

  if (peopleResult.error) {
    throw new Error("Could not load people");
  }

  const personRows = peopleResult.data as unknown as PersonRow[];
  const avatarUrls = await getMemberAvatarUrls(
    personRows.map((row) => row.avatar_path),
  );

  return personRows.map((row) => {
    const emails = [...row.person_emails].sort(
      (left, right) => Number(right.is_primary) - Number(left.is_primary),
    );
    const activeMemberships = row.memberships.filter(
      (membership) => membership.status === "active",
    );
    const endedMemberships = row.memberships.filter(
      (membership) => membership.status === "ended",
    );
    // An ended membership's administrator role is history, never current
    // authorization — the same rule the access layer applies when signing in.
    const isOrganizationAdmin = activeMemberships.some(
      (membership) => membership.role === "organization_admin",
    );
    const isBlocked = row.portal_access_status === "suspended";
    const lastSignInAt = row.portal_accounts
      .map((account) => account.last_seen_at)
      .sort()
      .at(-1);

    return {
      accessLevel: isBlocked
        ? "suspended"
        : row.portal_administrators
          ? "portal_admin"
          : isOrganizationAdmin
            ? "organization_admin"
            : "member",
      avatarUrl: row.avatar_path ? avatarUrls.get(row.avatar_path) : undefined,
      deletedAt: row.deleted_at,
      email: emails[0]?.email ?? null,
      hasAlumniAccess: Boolean(row.alumni_access_granted_at),
      hasMembership: row.memberships.length > 0,
      id: row.id,
      isDeleted: Boolean(row.deleted_at),
      isPortalAdmin: Boolean(row.portal_administrators),
      lastSignInAt: lastSignInAt ?? null,
      name: row.full_name ?? "Unnamed person",
      organizations: activeMemberships
        .map((membership) => organizationName(membership.organizations))
        .filter((name): name is string => Boolean(name)),
      status: row.deleted_at
        ? "deleted"
        : activeMemberships.length > 0
          ? "active"
          : // Alumni access granted by a portal administrator makes someone an
            // alumnus even when no membership was ever recorded for them.
            endedMemberships.length > 0 || row.alumni_access_granted_at
            ? "alumni"
            : "none",
    } satisfies RegistryPerson;
  });
}
