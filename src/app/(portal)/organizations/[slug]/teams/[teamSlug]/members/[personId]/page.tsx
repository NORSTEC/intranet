import { notFound } from "next/navigation";
import { MemberProfileView } from "@/components/portal/member-profile-view";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";

type Person = {
  id: number;
  full_name: string | null;
  avatar_path: string | null;
  avatar_alt: string | null;
  field_of_study: string | null;
  study_year: number | null;
  linkedin_url: string | null;
  phone_number: string | null;
};

type CurrentTeamMembership = {
  people: Person | Person[];
};

type OrganizationMembership = {
  status: string;
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

export default async function TeamMemberDetailsPage({
  params,
}: {
  params: Promise<{ slug: string; teamSlug: string; personId: string }>;
}) {
  await requirePortalAccess();
  const { slug, teamSlug, personId: personIdParam } = await params;
  const personId = Number(personIdParam);
  if (!Number.isSafeInteger(personId) || personId <= 0) notFound();

  const supabase = await createClient();
  const organizationResult = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (organizationResult.error) throw new Error("Could not load organization");
  if (!organizationResult.data) notFound();

  const teamResult = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("organization_id", organizationResult.data.id)
    .eq("slug", teamSlug)
    .eq("status", "active")
    .maybeSingle();

  if (teamResult.error) throw new Error("Could not load team");
  if (!teamResult.data) notFound();

  const currentMembershipResult = await supabase
    .from("team_memberships")
    .select(
      "people!team_memberships_person_id_fkey (id, full_name, avatar_path, avatar_alt, field_of_study, study_year, linkedin_url, phone_number)",
    )
    .eq("team_id", teamResult.data.id)
    .eq("person_id", personId)
    .is("archived_at", null)
    .maybeSingle();

  if (currentMembershipResult.error) throw new Error("Could not load team member");
  if (!currentMembershipResult.data) notFound();

  const currentMembership = currentMembershipResult.data as CurrentTeamMembership;
  const person = Array.isArray(currentMembership.people)
    ? currentMembership.people[0]
    : currentMembership.people;
  if (!person) notFound();

  const [
    organizationMembershipsResult,
    experiencesResult,
    personEmailsResult,
    avatarUrls,
  ] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("status")
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

  const name = person.full_name ?? "Unnamed member";
  const avatarUrl = person.avatar_path
    ? avatarUrls.get(person.avatar_path)
    : undefined;
  const organizationMemberships =
    organizationMembershipsResult.data as OrganizationMembership[];
  const status = organizationMemberships.some(
    (membership) => membership.status === "active",
  )
    ? "Active"
    : organizationMemberships.some((membership) => membership.status === "ended")
      ? "Alumni"
      : "Pending";
  const experience = (experiencesResult.data as ProfileExperience[]).map((entry) => {
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

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/organizations/${slug}`]: organizationResult.data.name,
          [`/organizations/${slug}/teams/${teamSlug}`]: teamResult.data.name,
          [`/organizations/${slug}/teams/${teamSlug}/members/${person.id}`]: name,
        }}
      />

      <MemberProfileView
        avatarAlt={person.avatar_alt}
        avatarUrl={avatarUrl}
        emails={personEmailsResult.data}
        experience={experience}
        fieldOfStudy={person.field_of_study}
        linkedinUrl={person.linkedin_url}
        name={name}
        phoneNumber={person.phone_number}
        status={status}
        studyYear={person.study_year}
      />
    </>
  );
}
