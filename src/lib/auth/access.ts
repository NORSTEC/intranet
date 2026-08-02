import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  PortalAccessState,
  AdministeredOrganization,
  PortalMembership,
  PortalProfile,
  MembershipRole,
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
  portal_access_status: "unclaimed" | "active" | "suspended" | "deactivated";
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
  role: MembershipRole;
  status: "active" | "ended";
  organizations:
    | { id: number; name: string; slug: string }
    | { id: number; name: string; slug: string }[];
};

const rolePriority: Record<MembershipRole, number> = {
  member: 1,
  organization_admin: 2,
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
      "auth_user_id, person_id, account_email, people (id, full_name, first_name, last_name, field_of_study, study_year, phone_number, linkedin_url, avatar_path, avatar_alt, portal_access_status)",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountResult.error || !accountResult.data) {
    return { status: "error" };
  }

  const accountRow = accountResult.data as PortalAccountRow;
  const [membershipsResult, portalAdministratorResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, organization_id, role, status, organizations (id, name, slug)")
      .eq("person_id", accountRow.person_id)
      .in("status", ["active", "ended"]),
    supabase
      .from("portal_administrators")
      .select("person_id")
      .eq("person_id", accountRow.person_id)
      .maybeSingle(),
  ]);

  if (membershipsResult.error || portalAdministratorResult.error) {
    return { status: "error" };
  }

  const profileRow = Array.isArray(accountRow.people)
    ? accountRow.people[0]
    : accountRow.people;
  if (!profileRow) {
    return { status: "error" };
  }
  if (profileRow.portal_access_status !== "active") {
    return {
      status: "inactive",
      reason: profileRow.portal_access_status,
    };
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
    isPortalAdmin: Boolean(portalAdministratorResult.data),
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

  if (access.status === "inactive") {
    redirect(`/login?error=${access.reason}`);
  }

  if (!access.membership) {
    redirect("/access");
  }

  return { ...access, membership: access.membership };
}

export async function requireOrganizationAdminAccess() {
  const access = await requirePortalAccess();
  let administeredOrganizations: AdministeredOrganization[];

  if (access.isPortalAdmin) {
    const supabase = await createClient();
    const organizationsResult = await supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("status", "active")
      .order("name");

    if (organizationsResult.error) {
      redirect("/?error=authorization");
    }

    administeredOrganizations = organizationsResult.data.map((organization) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    }));
  } else {
    administeredOrganizations = access.memberships
      .filter(
        (membership) =>
          membership.status === "active" &&
          membership.role === "organization_admin",
      )
      .map((membership) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        organizationSlug: membership.organizationSlug,
      }));
  }

  if (administeredOrganizations.length === 0) {
    redirect("/");
  }

  return { ...access, administeredOrganizations };
}

export async function requirePortalAdminAccess() {
  const access = await requirePortalAccess();

  if (!access.isPortalAdmin) {
    redirect("/");
  }

  return access;
}
