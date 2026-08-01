import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  PortalAccessState,
  PortalMembership,
  PortalProfile,
  PortalRole,
} from "@/lib/auth/types";

type ProfileRow = {
  id: number;
  avatar_path: string | null;
  avatar_alt: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  field_of_study: string | null;
  study_year: number | null;
  phone_number: string | null;
  linkedin_url: string | null;
};

type PortalAccountRow = {
  auth_user_id: string;
  person_id: number;
  account_email: string;
  people: ProfileRow | ProfileRow[];
};

type MembershipRow = {
  id: number;
  organization_id: number;
  role: PortalRole;
  status: "active" | "ended";
  organizations:
    | { id: number; name: string; slug: string }
    | { id: number; name: string; slug: string }[];
};

const rolePriority: Record<PortalRole, number> = {
  member: 1,
  organization_admin: 2,
  norstec_admin: 3,
};

export async function getPortalAccess(): Promise<PortalAccessState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const accountResult = await supabase
    .from("portal_accounts")
    .select(
      "auth_user_id, person_id, account_email, people (id, full_name, first_name, last_name, field_of_study, study_year, phone_number, linkedin_url, avatar_path, avatar_alt)",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountResult.error || !accountResult.data) {
    return { status: "error" };
  }

  const accountRow = accountResult.data as PortalAccountRow;
  const [membershipsResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, organization_id, role, status, organizations (id, name, slug)")
      .eq("person_id", accountRow.person_id)
      .in("status", ["active", "ended"]),
  ]);

  if (membershipsResult.error) {
    return { status: "error" };
  }

  const profileRow = Array.isArray(accountRow.people)
    ? accountRow.people[0]
    : accountRow.people;
  if (!profileRow) {
    return { status: "error" };
  }
  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[];
  const sortedMembershipRows = membershipRows.sort(
    (left, right) =>
      Number(right.status === "active") - Number(left.status === "active") ||
      rolePriority[right.role] - rolePriority[left.role],
  );

  const profile: PortalProfile = {
    personId: profileRow.id,
    userId: accountRow.auth_user_id,
    email: accountRow.account_email,
    avatarPath: profileRow.avatar_path,
    avatarAlt: profileRow.avatar_alt,
    fullName: profileRow.full_name,
    firstName: profileRow.first_name,
    lastName: profileRow.last_name,
    fieldOfStudy: profileRow.field_of_study,
    studyYear: profileRow.study_year,
    phoneNumber: profileRow.phone_number,
    linkedinUrl: profileRow.linkedin_url,
  };

  const memberships: PortalMembership[] = [];
  for (const membershipRow of sortedMembershipRows) {
    const organization = Array.isArray(membershipRow.organizations)
      ? membershipRow.organizations[0]
      : membershipRow.organizations;

    if (!organization) {
      return { status: "error" };
    }

    memberships.push({
      id: membershipRow.id,
      organizationId: membershipRow.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      // An old administrator role is history, never current authorization.
      role: membershipRow.status === "active" ? membershipRow.role : "member",
      status: membershipRow.status,
    });
  }

  return {
    status: "authenticated",
    profile,
    membership: memberships[0] ?? null,
    memberships,
  };
}

export async function requirePortalAccess() {
  const access = await getPortalAccess();

  if (access.status === "unauthenticated") {
    redirect("/login");
  }

  if (access.status === "error") {
    redirect("/login?error=authorization");
  }

  if (!access.membership) {
    redirect("/access");
  }

  return { ...access, membership: access.membership };
}

export async function requirePortalRole(allowedRoles: PortalRole[]) {
  const access = await requirePortalAccess();

  if (!allowedRoles.includes(access.membership.role)) {
    redirect("/");
  }

  return access;
}
