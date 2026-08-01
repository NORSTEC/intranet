import Link from "next/link";
import { MemberAvatar } from "@/components/portal/member-avatar";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";

type MembershipRow = {
  id: number;
  status: string;
  people:
    | { id: number; full_name: string | null; avatar_path: string | null }
    | Array<{ id: number; full_name: string | null; avatar_path: string | null }>;
  organizations:
    | { id: number; name: string; slug: string }
    | Array<{ id: number; name: string; slug: string }>;
};

type TeamMembershipRow = {
  person_id: number;
  teams:
    | { name: string; slug: string; organizations: { slug: string } | Array<{ slug: string }> }
    | Array<{ name: string; slug: string; organizations: { slug: string } | Array<{ slug: string }> }>;
};

type DirectoryMember = {
  id: number;
  name: string;
  avatarPath: string | null;
  statuses: Set<string>;
  organizations: Map<number, { name: string; slug: string }>;
  teams: Array<{ name: string; href: string }>;
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requirePortalAccess();
  const { status = "all", q = "" } = await searchParams;
  const supabase = await createClient();

  const [membershipsResult, teamMembershipsResult] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, status, people (id, full_name, avatar_path), organizations (id, name, slug)",
      )
      .in("status", ["active", "alumni"]),
    supabase
      .from("team_memberships")
      .select("person_id, teams (name, slug, organizations (slug))"),
  ]);

  if (membershipsResult.error || teamMembershipsResult.error) {
    throw new Error("Could not load member directory");
  }

  const membersById = new Map<number, DirectoryMember>();
  for (const row of membershipsResult.data as MembershipRow[]) {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    if (!person || !organization) continue;

    const member = membersById.get(person.id) ?? {
      id: person.id,
      name: person.full_name ?? "Unnamed member",
      avatarPath: person.avatar_path,
      statuses: new Set<string>(),
      organizations: new Map<number, { name: string; slug: string }>(),
      teams: [],
    };
    member.statuses.add(row.status);
    member.organizations.set(organization.id, organization);
    membersById.set(person.id, member);
  }

  for (const row of teamMembershipsResult.data as TeamMembershipRow[]) {
    const member = membersById.get(row.person_id);
    if (!member) continue;
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    if (!team) continue;
    const organization = Array.isArray(team.organizations)
      ? team.organizations[0]
      : team.organizations;
    if (!organization) continue;
    member.teams.push({
      name: team.name,
      href: `/organizations/${organization.slug}/teams/${team.slug}`,
    });
  }

  const normalizedQuery = q.trim().toLocaleLowerCase("en");
  const members = [...membersById.values()]
    .filter((member) => status === "all" || member.statuses.has(status))
    .filter((member) => {
      if (!normalizedQuery) return true;
      const searchable = [
        member.name,
        ...[...member.organizations.values()].map((organization) => organization.name),
        ...member.teams.map((team) => team.name),
      ]
        .join(" ")
        .toLocaleLowerCase("en");
      return searchable.includes(normalizedQuery);
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const avatarUrls = await getMemberAvatarUrls(members.map((member) => member.avatarPath));

  function filterHref(nextStatus: string) {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (q.trim()) params.set("q", q.trim());
    const query = params.toString();
    return query ? `/members?${query}` : "/members";
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["active", "Active"],
            ["alumni", "Alumni"],
          ].map(([value, label]) => (
            <Link
              className={`portal-pill ${status === value ? "portal-pill-filled" : "portal-pill-outline"}`}
              href={filterHref(value)}
              key={value}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="relative w-full sm:w-auto" method="get">
          {status !== "all" && <input name="status" type="hidden" value={status} />}
          <label>
            <span className="sr-only">Search members</span>
            <input
              className="portal-field w-full pr-10 sm:w-72"
              defaultValue={q}
              name="q"
              placeholder="Search members"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
              search
            </span>
          </label>
        </form>
      </div>

      <section className="mt-7 grid gap-3">
        {members.map((member) => (
          <article
            key={member.id}
            className="portal-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-4 sm:w-64">
              <MemberAvatar
                name={member.name}
                src={member.avatarPath ? avatarUrls.get(member.avatarPath) : undefined}
              />
              <p className="truncate font-medium">{member.name}</p>
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {[...member.organizations.values()].map((organization) => (
                <Link
                  className="portal-pill portal-pill-outline"
                  href={`/organizations/${organization.slug}`}
                  key={organization.slug}
                >
                  {organization.name}
                </Link>
              ))}
              {member.teams.map((team) => (
                <Link className="portal-pill portal-pill-outline" href={team.href} key={team.href}>
                  {team.name}
                </Link>
              ))}
            </div>
            <span className="portal-pill portal-pill-outline">
              {member.statuses.has("active") ? "Active" : "Alumni"}
            </span>
          </article>
        ))}
        {members.length === 0 && (
          <p className="text-sm opacity-55">No members match this view.</p>
        )}
      </section>
    </>
  );
}
