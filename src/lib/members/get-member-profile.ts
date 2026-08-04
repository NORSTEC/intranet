import "server-only";

import type { MemberProfileExperience } from "@/components/portal/member-profile-view";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";

type Person = {
  id: number;
  alumni_access_granted_at: string | null;
  full_name: string | null;
  avatar_path: string | null;
  avatar_alt: string | null;
  field_of_study: string | null;
  study_year: number | null;
  linkedin_url: string | null;
  phone_number: string | null;
};

type OrganizationMembership = {
  status: string;
  organizations: { name: string } | Array<{ name: string }> | null;
};

type ProfileExperience = {
  id: number;
  organization_name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  organizations:
    | { logo_path: string | null }
    | Array<{ logo_path: string | null }>
    | null;
  profile_experience_roles: Array<{
    id: number;
    role_title: string | null;
    starts_on: string | null;
    ends_on: string | null;
    team_name: string;
  }>;
};

export type MemberProfileData = {
  avatarAlt: string | null;
  avatarUrl?: string;
  email: string | null;
  experience: MemberProfileExperience[];
  fieldOfStudy: string | null;
  linkedinUrl: string | null;
  name: string;
  organizationName: string | null;
  phoneNumber: string | null;
  status: string;
  studyYear: number | null;
};

export async function getMemberProfile(
  personId: number,
): Promise<MemberProfileData | null> {
  const supabase = await createClient();
  const personResult = await supabase
    .from("people")
    .select(
      "id, full_name, avatar_path, avatar_alt, field_of_study, study_year, linkedin_url, phone_number, alumni_access_granted_at",
    )
    .eq("id", personId)
    .maybeSingle();

  if (personResult.error) throw new Error("Could not load member");
  if (!personResult.data) return null;
  const person = personResult.data as Person;

  const [
    organizationMembershipsResult,
    experiencesResult,
    personEmailsResult,
    avatarUrls,
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select("status, organizations (name)")
      .eq("person_id", person.id)
      .in("status", ["active", "ended"]),
    supabase
      .from("profile_experiences")
      .select(
        "id, organization_name, description, starts_on, ends_on, organizations (logo_path), profile_experience_roles (id, team_name, role_title, starts_on, ends_on)",
      )
      .eq("person_id", person.id)
      .order("starts_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("person_emails")
      .select("id, email, email_type, is_primary")
      .eq("person_id", person.id)
      .order("is_primary", { ascending: false }),
    getMemberAvatarUrls([person.avatar_path]),
  ]);

  if (
    organizationMembershipsResult.error ||
    experiencesResult.error ||
    personEmailsResult.error
  ) {
    throw new Error("Could not load member details");
  }

  const memberships =
    organizationMembershipsResult.data as OrganizationMembership[];
  const status = memberships.some((membership) => membership.status === "active")
    ? "Active"
    : memberships.some((membership) => membership.status === "ended") ||
        person.alumni_access_granted_at
      ? "Alumni"
      : "Pending";
  const organizationName = memberships
    .filter((membership) => membership.status === "active")
    .map((membership) =>
      Array.isArray(membership.organizations)
        ? membership.organizations[0]?.name
        : membership.organizations?.name,
    )
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const experience: MemberProfileExperience[] = (
    experiencesResult.data as ProfileExperience[]
  ).map((entry) => {
    const organization = Array.isArray(entry.organizations)
      ? entry.organizations[0]
      : entry.organizations;
    return {
      id: entry.id,
      description: entry.description,
      startsOn: entry.starts_on,
      endsOn: entry.ends_on,
      organization: {
        logoPath: organization?.logo_path ?? null,
        name: entry.organization_name,
      },
      teams: entry.profile_experience_roles.map((role) => ({
        id: role.id,
        roleTitle: role.role_title,
        startsOn: role.starts_on,
        endsOn: role.ends_on,
        name: role.team_name,
      })),
    };
  });

  return {
    avatarAlt: person.avatar_alt,
    avatarUrl: person.avatar_path
      ? avatarUrls.get(person.avatar_path)
      : undefined,
    email:
      personEmailsResult.data.find((personEmail) => personEmail.is_primary)
        ?.email ?? null,
    experience,
    fieldOfStudy: person.field_of_study,
    linkedinUrl: person.linkedin_url,
    name: person.full_name ?? "Unnamed member",
    organizationName: organizationName || null,
    phoneNumber: person.phone_number,
    status,
    studyYear: person.study_year,
  };
}
