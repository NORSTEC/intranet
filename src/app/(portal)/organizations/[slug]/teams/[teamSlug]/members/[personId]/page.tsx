import Image from "next/image";
import { notFound } from "next/navigation";
import { OrganizationLogo } from "@/components/portal/organization-logo";
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
  id: number;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  organizations:
    | { id: number; logo_path: string | null; name: string; slug: string }
    | Array<{
        id: number;
        logo_path: string | null;
        name: string;
        slug: string;
      }>;
};

type TeamMembership = {
  id: number;
  role_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  teams:
    | {
        id: number;
        name: string;
        slug: string;
        organizations:
          | { id: number; name: string; slug: string }
          | Array<{ id: number; name: string; slug: string }>;
      }
    | Array<{
        id: number;
        name: string;
        slug: string;
        organizations:
          | { id: number; name: string; slug: string }
          | Array<{ id: number; name: string; slug: string }>;
      }>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatPeriod(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return "Dates not added";
  if (!startsOn) return `Until ${formatMonth(endsOn!)}`;
  return `${formatMonth(startsOn)} – ${endsOn ? formatMonth(endsOn) : "Present"}`;
}

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
      "people (id, full_name, avatar_path, avatar_alt, field_of_study, study_year, linkedin_url, phone_number)",
    )
    .eq("team_id", teamResult.data.id)
    .eq("person_id", personId)
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
    teamMembershipsResult,
    personEmailsResult,
    avatarUrls,
  ] =
    await Promise.all([
      supabase
        .from("memberships")
        .select(
          "id, starts_on, ends_on, status, organizations (id, name, slug, logo_path)",
        )
        .eq("person_id", person.id)
        .in("status", ["active", "alumni", "ended"]),
      supabase
        .from("team_memberships")
        .select(
          "id, role_title, starts_on, ends_on, teams (id, name, slug, organizations (id, name, slug))",
        )
        .eq("person_id", person.id),
      supabase
        .from("person_emails")
        .select("id, email, email_type, is_primary")
        .eq("person_id", person.id)
        .order("is_primary", { ascending: false }),
      getMemberAvatarUrls([person.avatar_path]),
    ]);

  if (
    organizationMembershipsResult.error ||
    teamMembershipsResult.error ||
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
  const teamMemberships = teamMembershipsResult.data as TeamMembership[];
  const status = organizationMemberships.some(
    (membership) => membership.status === "active",
  )
    ? "Active"
    : organizationMemberships.some((membership) => membership.status === "alumni")
      ? "Alumni"
      : "Former member";
  const experience = organizationMemberships
    .map((membership) => {
      const organization = Array.isArray(membership.organizations)
        ? membership.organizations[0]
        : membership.organizations;
      if (!organization) return null;

      const teams = teamMemberships.flatMap((teamMembership) => {
        const team = Array.isArray(teamMembership.teams)
          ? teamMembership.teams[0]
          : teamMembership.teams;
        if (!team) return [];
        const teamOrganization = Array.isArray(team.organizations)
          ? team.organizations[0]
          : team.organizations;
        if (!teamOrganization || teamOrganization.id !== organization.id) return [];
        return [{ ...teamMembership, team }];
      });

      return { ...membership, organization, teams };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => {
      if (left.status === "active" && right.status !== "active") return -1;
      if (right.status === "active" && left.status !== "active") return 1;
      return (right.starts_on ?? "").localeCompare(left.starts_on ?? "");
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

      <section className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-center lg:gap-12">
        <div className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-moody-static">
          {avatarUrl ? (
            <Image
              alt={person.avatar_alt ?? name}
              className="object-cover"
              fill
              priority
              sizes="(min-width: 1024px) 320px, 90vw"
              src={avatarUrl}
              unoptimized
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-5xl font-medium text-egg-static">
              {initials(name)}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-h2">{name}</h1>

          <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="section-label opacity-45">Status</dt>
              <dd className="mt-2 font-medium">{status}</dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Phone</dt>
              <dd className="mt-2 font-medium">
                {person.phone_number ? (
                  <a
                    className="transition-colors hover:text-copper"
                    href={`tel:${person.phone_number.replace(/[^+\d]/g, "")}`}
                  >
                    {person.phone_number}
                  </a>
                ) : (
                  "Not provided"
                )}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Field of study</dt>
              <dd className="mt-2 font-medium">
                {person.field_of_study ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Study year</dt>
              <dd className="mt-2 font-medium">
                {person.study_year ?? "Not provided"}
              </dd>
            </div>
            {personEmailsResult.data.length > 0 && (
              <div>
                <dt className="section-label opacity-45">Email</dt>
                <dd className="mt-2 flex flex-wrap gap-x-5 gap-y-2 font-medium">
                  {personEmailsResult.data.map((personEmail) => (
                    <a
                      className="transition-colors hover:text-copper"
                      href={`mailto:${personEmail.email}`}
                      key={personEmail.id}
                    >
                      {personEmail.email}
                    </a>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {person.linkedin_url && (
            <a
              className="portal-button mt-8 w-fit"
              href={person.linkedin_url}
              rel="noreferrer"
              target="_blank"
            >
              LinkedIn
              <span className="material-symbols-outlined text-[1.15rem]">
                open_in_new
              </span>
            </a>
          )}
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-h2">Experience</h2>
        <div className="mt-8 grid gap-6">
          {experience.map((entry) => (
            <article
              className="portal-surface p-6 sm:p-8"
              key={entry.id}
            >
              <header className="flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="section-label opacity-45">Organization</p>
                  <h3 className="mt-2 text-2xl font-medium">
                    {entry.organization.name}
                  </h3>
                  <p className="mt-3 text-sm font-medium opacity-55">
                    {formatPeriod(entry.starts_on, entry.ends_on)}
                  </p>
                </div>
                <OrganizationLogo
                  logoPath={entry.organization.logo_path}
                  name={entry.organization.name}
                  size="experience"
                />
              </header>

              <div className="mt-10">
                <p className="section-label opacity-45">Teams</p>
                {entry.teams.length > 0 ? (
                  <div className="mt-6 grid gap-x-12 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                    {entry.teams.map((teamEntry) => (
                      <div key={teamEntry.id}>
                        <h4 className="text-xl font-medium">
                          {teamEntry.team.name}
                        </h4>
                        <p className="mt-3 font-medium text-sky">
                          {teamEntry.role_title ?? "Role not added"}
                        </p>
                        <p className="mt-2 text-sm opacity-55">
                          {formatPeriod(teamEntry.starts_on, teamEntry.ends_on)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 text-sm opacity-50">
                    No team history added.
                  </p>
                )}
              </div>
            </article>
          ))}
          {experience.length === 0 && (
            <p className="text-sm opacity-55">No organization history added.</p>
          )}
        </div>
      </section>
    </>
  );
}
