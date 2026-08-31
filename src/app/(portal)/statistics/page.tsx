import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { GrowthChart } from "@/components/portal/statistics/growth-chart";
import { RankedBars } from "@/components/portal/statistics/ranked-bars";
import { StatusDonut } from "@/components/portal/statistics/status-donut";
import { StudyYearColumns } from "@/components/portal/statistics/study-year-columns";
import {
  buildGrowthSeries,
  bucketByStudyYear,
  rankByCount,
  type MembershipPeriod,
} from "@/lib/statistics";

type MembershipRow = {
  person_id: number;
  organization_id: number;
  status: string;
  joined_at: string;
  ended_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  organizations: { name: string } | Array<{ name: string }>;
};

type PersonRow = {
  field_of_study: string | null;
  study_year: number | null;
};

export default async function StatisticsPage() {
  await requirePortalAccess();
  const supabase = await createClient();

  const membershipsResult = await supabase
    .from("memberships")
    .select(
      "person_id, organization_id, status, joined_at, ended_at, starts_on, ends_on, organizations (name)",
    )
    .in("status", ["active", "ended"]);

  if (membershipsResult.error) {
    console.error("statistics memberships query failed", membershipsResult.error);
    throw new Error(`Could not load intranet statistics: ${membershipsResult.error.message}`);
  }

  const memberships = membershipsResult.data as MembershipRow[];
  const allMemberIds = new Set(memberships.map((membership) => membership.person_id));
  const activeMemberIds = new Set(
    memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.person_id),
  );
  const alumniMemberIds = new Set(
    memberships
      .filter((membership) => membership.status === "ended")
      .map((membership) => membership.person_id)
      .filter((personId) => !activeMemberIds.has(personId)),
  );

  // Current members only — an organization's bar must not count people who
  // have already left it.
  const organizationMembers = new Map<string, Set<number>>();
  for (const membership of memberships) {
    if (membership.status !== "active") continue;
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;
    if (!organization) continue;
    const members = organizationMembers.get(organization.name) ?? new Set<number>();
    members.add(membership.person_id);
    organizationMembers.set(organization.name, members);
  }
  const organizationsRanked = [...organizationMembers.entries()]
    .map(([label, members]) => ({ label, count: members.size }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  // Each membership carries its own span, so the growth series comes from
  // `memberships` directly: `starts_on`/`ends_on` when set, otherwise the
  // `joined_at`/`ended_at` timestamps trimmed to a date.
  const periods: MembershipPeriod[] = memberships.map((membership) => ({
    startsOn: membership.starts_on ?? membership.joined_at.slice(0, 10),
    endsOn: membership.ends_on ?? membership.ended_at?.slice(0, 10) ?? null,
    personId: membership.person_id,
  }));
  const growthSeries = buildGrowthSeries(periods);

  const activeIds = [...activeMemberIds];
  const peopleResult =
    activeIds.length > 0
      ? await supabase.from("people").select("field_of_study, study_year").in("id", activeIds)
      : { data: [] as PersonRow[], error: null };
  if (peopleResult.error) {
    console.error("statistics people query failed", peopleResult.error);
    throw new Error(`Could not load intranet statistics: ${peopleResult.error.message}`);
  }

  const activeProfiles = peopleResult.data as PersonRow[];
  const fieldsRanked = rankByCount(activeProfiles, (person) => person.field_of_study);
  const studyYears = bucketByStudyYear(
    activeProfiles.map((person) => ({ studyYear: person.study_year })),
  );

  const growthFrom = growthSeries.at(0)?.label;
  const growthTo = growthSeries.at(-1)?.label;

  return (
    <>
      <section className="portal-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-h3 font-medium">Member growth</h2>
          <p className="text-sm opacity-60">
            {growthFrom && growthTo ? `${growthFrom} — ${growthTo}` : "Active members by month"}
          </p>
        </div>
        <div className="mt-7">
          <GrowthChart points={growthSeries} />
        </div>
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <article className="portal-surface flex flex-col p-6 sm:p-8 md:aspect-square">
          <h2 className="text-h3 font-medium">Members by organization</h2>
          <p className="mt-1 text-sm opacity-60">
            {activeMemberIds.size} {activeMemberIds.size === 1 ? "member" : "members"} across{" "}
            {organizationsRanked.length}{" "}
            {organizationsRanked.length === 1 ? "organization" : "organizations"}
          </p>
          <div className="mt-7 md:min-h-0 md:flex-1">
            <RankedBars
              items={organizationsRanked}
              hue="var(--color-sky)"
              emptyLabel="No memberships recorded yet."
            />
          </div>
        </article>

        <article className="portal-surface flex flex-col p-6 sm:p-8 md:aspect-square">
          <h2 className="text-h3 font-medium">Field of study</h2>
          <p className="mt-1 text-sm opacity-60">
            {fieldsRanked.length} {fieldsRanked.length === 1 ? "field" : "fields"} among{" "}
            {activeProfiles.length} members
          </p>
          <div className="mt-7 md:min-h-0 md:flex-1">
            <RankedBars
              items={fieldsRanked}
              hue="var(--color-beachball)"
              emptyLabel="No fields of study recorded yet."
            />
          </div>
        </article>

        <article className="portal-surface flex flex-col p-6 sm:p-8 md:aspect-square">
          <h2 className="text-h3 font-medium">Study year</h2>
          <p className="mt-1 text-sm opacity-60">Members by year of study</p>
          <div className="mt-7 md:min-h-0 md:flex-1">
            <StudyYearColumns buckets={studyYears} />
          </div>
        </article>

        <article className="portal-surface flex flex-col p-6 sm:p-8 md:aspect-square">
          <h2 className="text-h3 font-medium">Active and alumni</h2>
          <p className="mt-1 text-sm opacity-60">Members by current status</p>
          <div className="mt-4 md:min-h-0 md:flex-1">
            <StatusDonut
              total={allMemberIds.size}
              centreLabel="Members"
              segments={[
                {
                  label: "Active",
                  // Same lighter blue already used for the Field of study bars.
                  count: activeMemberIds.size,
                  fill: "var(--color-sky)",
                  onFill: "#0f1118",
                },
                {
                  label: "Alumni",
                  count: alumniMemberIds.size,
                  fill: "var(--color-copper)",
                  onFill: "#0f1118",
                },
              ]}
            />
          </div>
        </article>
      </section>
    </>
  );
}
