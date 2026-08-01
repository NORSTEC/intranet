import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type MembershipRow = {
  person_id: number;
  organization_id: number;
  status: string;
  organizations:
    | { name: string }
    | Array<{ name: string }>;
};

export default async function StatisticsPage() {
  await requirePortalAccess();
  const supabase = await createClient();

  const [organizationsResult, teamsResult, membershipsResult] = await Promise.all([
    supabase.from("organizations").select("id").eq("status", "active"),
    supabase.from("teams").select("id").eq("status", "active"),
    supabase
      .from("memberships")
      .select("person_id, organization_id, status, organizations (name)")
      .in("status", ["active", "alumni"]),
  ]);

  if (organizationsResult.error || teamsResult.error || membershipsResult.error) {
    throw new Error("Could not load portal statistics");
  }

  const memberships = membershipsResult.data as MembershipRow[];
  const people = new Set(memberships.map((membership) => membership.person_id));
  const activePeople = new Set(
    memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.person_id),
  );
  const alumniPeople = new Set(
    memberships
      .filter((membership) => membership.status === "alumni")
      .map((membership) => membership.person_id),
  );
  const organizationCounts = new Map<string, Set<number>>();
  for (const membership of memberships) {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;
    if (!organization) continue;
    const count = organizationCounts.get(organization.name) ?? new Set<number>();
    count.add(membership.person_id);
    organizationCounts.set(organization.name, count);
  }
  const organizations = [...organizationCounts.entries()]
    .map(([name, members]) => ({ name, count: members.size }))
    .sort((left, right) => right.count - left.count);
  const largestOrganization = Math.max(...organizations.map((item) => item.count), 1);

  const overview = [
    ["Members", people.size.toString(), "Unique people"],
    ["Organizations", organizationsResult.data.length.toString(), "Active organizations"],
    ["Teams", teamsResult.data.length.toString(), "Across the network"],
    ["Alumni", alumniPeople.size.toString(), "Unique people"],
  ];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.map(([label, value, detail]) => (
          <article key={label} className="portal-surface p-6">
            <p className="section-label opacity-50">{label}</p>
            <p className="mt-5 text-4xl font-light">{value}</p>
            <p className="mt-3 text-sm opacity-50">{detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-12 grid gap-5 lg:grid-cols-2">
        <article className="portal-surface p-6 sm:p-8">
          <h2 className="text-h3 font-medium">Members by organization</h2>
          <div className="mt-8 space-y-5">
            {organizations.map((organization) => (
              <div key={organization.name}>
                <div className="flex justify-between text-sm">
                  <span>{organization.name}</span>
                  <span className="opacity-50">{organization.count}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-moody/10">
                  <div
                    className="h-full rounded-full bg-copper"
                    style={{ width: `${(organization.count / largestOrganization) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="portal-surface p-6 sm:p-8">
          <h2 className="text-h3 font-medium">Member status</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="portal-pill">{activePeople.size} active</span>
            <span className="portal-pill portal-pill-outline">
              {alumniPeople.size} alumni
            </span>
          </div>
          <p className="mt-8 max-w-md text-sm opacity-55">
            Counts are based on current organization memberships. A person who belongs to
            several organizations is counted once in the overview.
          </p>
        </article>
      </section>
    </>
  );
}
