import Link from "next/link";
import { PageHeader } from "@/components/portal/page-header";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type TeamMembershipRow = {
  id: number;
  role_title: string | null;
  teams:
    | {
        name: string;
        slug: string;
        organizations: { name: string; slug: string } | Array<{ name: string; slug: string }>;
      }
    | Array<{
        name: string;
        slug: string;
        organizations: { name: string; slug: string } | Array<{ name: string; slug: string }>;
      }>;
};

export default async function DashboardPage() {
  const access = await requirePortalAccess();
  const canAdminister = access.memberships.some((membership) => membership.role !== "member");
  const supabase = await createClient();

  const [teamsResult, requestsResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select("id, role_title, teams (name, slug, organizations (name, slug))")
      .eq("person_id", access.profile.personId),
    canAdminister
      ? supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (teamsResult.error || requestsResult.error) {
    throw new Error("Could not load dashboard");
  }

  const teams = (teamsResult.data as TeamMembershipRow[])
    .map((membership) => {
      const team = Array.isArray(membership.teams)
        ? membership.teams[0]
        : membership.teams;
      if (!team) return null;
      const organization = Array.isArray(team.organizations)
        ? team.organizations[0]
        : team.organizations;
      if (!organization) return null;
      return { ...membership, team, organization };
    })
    .filter((team): team is NonNullable<typeof team> => Boolean(team));
  const profileIncomplete = !access.profile.fullName || !access.profile.fieldOfStudy;

  return (
    <>
      <PageHeader description={
        access.memberships.length === 1
          ? access.membership.organizationName
          : `${access.memberships.length} organizations`
      } />

      <section aria-label="Membership overview" className="flex flex-wrap gap-3">
        <span className="portal-pill">
          <span className="size-2 rounded-full bg-beachball" />Active membership
        </span>
        <span className="portal-pill portal-pill-outline">
          {access.memberships.length} organizations
        </span>
        <span className="portal-pill portal-pill-outline">{teams.length} teams</span>
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <section>
          <h2 className="text-h2">Next</h2>
          <div className="mt-6 grid gap-4">
            {profileIncomplete && (
              <Link
                href="/profile"
                className="portal-surface portal-card-link group flex items-center justify-between gap-6 p-6 sm:p-7"
              >
                <span>
                  <span className="block text-h3 font-medium">Complete your profile</span>
                  <span className="mt-2 block text-sm opacity-55">Add missing profile details</span>
                </span>
                <span className="portal-pill portal-pill-filled">
                  Open<span className="material-symbols-outlined text-[1rem]">trending_flat</span>
                </span>
              </Link>
            )}
            {canAdminister && (requestsResult.count ?? 0) > 0 && (
              <Link
                href="/administration/access-requests"
                className="portal-surface portal-card-link group flex items-center justify-between gap-6 p-6 sm:p-7"
              >
                <span>
                  <span className="block text-h3 font-medium">Review access requests</span>
                  <span className="mt-2 block text-sm opacity-55">
                    {requestsResult.count} requests are waiting
                  </span>
                </span>
                <span className="portal-pill portal-pill-filled">
                  Review<span className="material-symbols-outlined text-[1rem]">trending_flat</span>
                </span>
              </Link>
            )}
            {!profileIncomplete && (!canAdminister || (requestsResult.count ?? 0) === 0) && (
              <p className="text-sm opacity-55">Nothing needs your attention.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-h2">Your teams</h2>
          <div className="mt-6 grid gap-3">
            {teams.map(({ id, role_title: roleTitle, team, organization }) => (
              <Link
                className="portal-surface portal-card-link flex items-center justify-between gap-5 p-5"
                href={`/organizations/${organization.slug}/teams/${team.slug}`}
                key={id}
              >
                <span>
                  <span className="block font-medium">{team.name}</span>
                  <span className="mt-1 block text-sm opacity-55">
                    {organization.name}{roleTitle ? ` · ${roleTitle}` : ""}
                  </span>
                </span>
                <span className="material-symbols-outlined">trending_flat</span>
              </Link>
            ))}
            {teams.length === 0 && (
              <p className="text-sm opacity-55">You have not been added to a team yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
