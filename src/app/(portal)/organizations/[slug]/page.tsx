import Link from "next/link";
import { notFound } from "next/navigation";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function formatSpecialization(value: string | null) {
  if (!value) return "Not specified";
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function OrganizationDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePortalAccess();
  const { slug } = await params;
  const supabase = await createClient();

  const organizationResult = await supabase
    .from("organizations")
    .select(
      "id, name, slug, specialization, website_url, short_description, location, logo_path",
    )
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (organizationResult.error) throw new Error("Could not load organization");
  if (!organizationResult.data) notFound();

  const organization = organizationResult.data;
  const [teamsResult, membershipsResult] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, slug, description")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", organization.id)
      .in("status", ["active", "alumni"]),
  ]);

  if (teamsResult.error || membershipsResult.error) {
    throw new Error("Could not load organization details");
  }

  const teamIds = teamsResult.data.map((team) => team.id);
  const teamMembershipsResult = teamIds.length
    ? await supabase.from("team_memberships").select("team_id").in("team_id", teamIds)
    : { data: [], error: null };

  if (teamMembershipsResult.error) throw new Error("Could not load team memberships");

  const teamMemberCounts = new Map<number, number>();
  for (const membership of teamMembershipsResult.data ?? []) {
    teamMemberCounts.set(
      membership.team_id,
      (teamMemberCounts.get(membership.team_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center lg:gap-12">
        <OrganizationLogo
          logoPath={organization.logo_path}
          name={organization.name}
          size="detail"
        />
        <div>
          <h1 className="text-h2">{organization.name}</h1>
          {organization.short_description && (
            <p className="mt-4 max-w-3xl text-sm opacity-60">
              {organization.short_description}
            </p>
          )}

          <dl className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <dt className="section-label opacity-45">Specialization</dt>
              <dd className="mt-2 font-medium">
                {formatSpecialization(organization.specialization)}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Members</dt>
              <dd className="mt-2 font-medium">{membershipsResult.data.length}</dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Location</dt>
              <dd className="mt-2 font-medium">{organization.location ?? "Not specified"}</dd>
            </div>
          </dl>

          {organization.website_url && (
            <a
              className="portal-button mt-8 w-fit"
              href={organization.website_url}
              rel="noreferrer"
              target="_blank"
            >
              Visit website
              <span className="material-symbols-outlined text-[1.15rem]">open_in_new</span>
            </a>
          )}
        </div>
      </section>

      <section className="mt-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-h2">Teams</h2>
          <span className="text-sm opacity-55">
            {teamsResult.data.length} {teamsResult.data.length === 1 ? "team" : "teams"}
          </span>
        </div>
        {teamsResult.data.length > 0 ? (
          <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {teamsResult.data.map((team) => (
              <Link
                key={team.id}
                href={`/organizations/${organization.slug}/teams/${team.slug}`}
                className="portal-surface portal-card-link group flex min-h-52 flex-col p-6"
              >
                <span className="portal-pill portal-pill-filled">
                  {teamMemberCounts.get(team.id) ?? 0} members
                </span>
                <h3 className="mt-7 text-xl font-medium">{team.name}</h3>
                {team.description && (
                  <p className="mt-2 text-sm opacity-55">{team.description}</p>
                )}
                <span className="material-symbols-outlined ml-auto mt-auto pt-6 transition-transform group-hover:translate-x-1">
                  trending_flat
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-7 text-sm opacity-55">No teams have been added yet.</p>
        )}
      </section>
    </>
  );
}
