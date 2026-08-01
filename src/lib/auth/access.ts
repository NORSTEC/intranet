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
  user_id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  field_of_study: string | null;
  study_year: number | null;
};

type MembershipRow = {
  id: number;
  organization_id: number;
  role: PortalRole;
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

  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, email, full_name, first_name, last_name, field_of_study, study_year",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, organization_id, role, organizations (id, name, slug)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  if (profileResult.error || membershipsResult.error || !profileResult.data) {
    return { status: "error" };
  }

  const profileRow = profileResult.data as ProfileRow;
  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[];
  const primaryMembershipRow = membershipRows.sort(
    (left, right) => rolePriority[right.role] - rolePriority[left.role],
  )[0];

  const profile: PortalProfile = {
    userId: profileRow.user_id,
    email: profileRow.email,
    fullName: profileRow.full_name,
    firstName: profileRow.first_name,
    lastName: profileRow.last_name,
    fieldOfStudy: profileRow.field_of_study,
    studyYear: profileRow.study_year,
  };

  let membership: PortalMembership | null = null;
  if (primaryMembershipRow) {
    const organization = Array.isArray(primaryMembershipRow.organizations)
      ? primaryMembershipRow.organizations[0]
      : primaryMembershipRow.organizations;

    if (!organization) {
      return { status: "error" };
    }

    membership = {
      id: primaryMembershipRow.id,
      organizationId: primaryMembershipRow.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      role: primaryMembershipRow.role,
    };
  }

  return { status: "authenticated", profile, membership };
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
