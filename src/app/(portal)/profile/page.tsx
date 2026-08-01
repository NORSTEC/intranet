import Link from "next/link";
import { MemberProfileView } from "@/components/portal/member-profile-view";
import { Toast } from "@/components/portal/toast";
import { requirePortalAccess } from "@/lib/auth/access";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const access = await requirePortalAccess();
  const { saved } = await searchParams;
  const supabase = await createClient();
  const [experiencesResult, emailsResult, avatarUrls] =
    await Promise.all([
      supabase
        .from("profile_experiences")
        .select(
          "id, organization_name, description, starts_on, ends_on, organizations (logo_path), profile_experience_roles (id, team_name, role_title, starts_on, ends_on)",
        )
        .eq("person_id", access.profile.personId)
        .order("starts_on", { ascending: false, nullsFirst: false }),
      supabase
        .from("person_emails")
        .select("id, email")
        .eq("person_id", access.profile.personId)
        .order("is_primary", { ascending: false }),
      getMemberAvatarUrls([access.profile.avatarPath]),
    ]);

  if (
    experiencesResult.error ||
    emailsResult.error
  ) {
    throw new Error("Could not load profile");
  }

  const status = access.memberships.some((membership) => membership.status === "active")
    ? "Active"
    : access.memberships.some((membership) => membership.status === "ended")
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
  const name = access.profile.fullName ?? access.profile.email;
  const avatarUrl = access.profile.avatarPath
    ? avatarUrls.get(access.profile.avatarPath)
    : undefined;

  return (
    <>
      {saved === "true" && (
        <Toast clearParams={["saved"]} message="Changes saved." status="success" />
      )}
      <MemberProfileView
      action={
        <Link className="portal-button" href="/profile/edit">
          <span className="material-symbols-outlined text-[1.1rem]">edit</span>
          Edit profile
        </Link>
      }
      avatarAlt={access.profile.avatarAlt}
      avatarUrl={avatarUrl}
      emails={emailsResult.data}
      experience={experience}
      fieldOfStudy={access.profile.fieldOfStudy}
      linkedinUrl={access.profile.linkedinUrl}
      name={name}
      phoneNumber={access.profile.phoneNumber}
      status={status}
      studyYear={access.profile.studyYear}
      />
    </>
  );
}
