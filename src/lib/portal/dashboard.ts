import "server-only";

import type { MembershipRole, PortalProfile } from "@/lib/auth/types";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

export type DashboardOrganization = {
  id: number;
  name: string;
  slug: string;
  logoPath: string | null;
  role: MembershipRole;
  status: "active" | "ended";
  since: string;
  until: string | null;
  teamCount: number;
};

export type DashboardTeammate = {
  personId: number;
  name: string;
  avatarUrl: string | undefined;
};

export type DashboardTeam = {
  id: number;
  name: string;
  slug: string;
  organizationName: string;
  organizationSlug: string;
  roleTitle: string | null;
  isPast: boolean;
  memberCount: number;
  teammates: DashboardTeammate[];
};

export type DashboardNewMember = {
  personId: number;
  name: string;
  fieldOfStudy: string | null;
  joinedOn: string;
  avatarUrl: string | undefined;
};

export type DashboardActions = {
  missingProfileFields: string[];
  profileFieldCount: number;
  canLinkBackupAccount: boolean;
  pendingAccessRequests: number;
};

export type PortalPulse = {
  activeMembers: number;
  alumni: number;
  organizations: number;
  joinedLastMonth: number;
};

export type DashboardData = {
  actions: DashboardActions;
  avatarUrl: string | undefined;
  memberSince: string | null;
  newMembers: DashboardNewMember[];
  organizations: DashboardOrganization[];
  pulse: PortalPulse;
  teams: DashboardTeam[];
};

type OrganizationJoin = {
  id: number;
  name: string;
  slug: string;
  logo_path: string | null;
};

type MembershipRow = {
  ends_on: string | null;
  ended_at: string | null;
  id: number;
  joined_at: string;
  organizations: OrganizationJoin | OrganizationJoin[] | null;
  role: MembershipRole;
  starts_on: string | null;
  status: "active" | "ended";
};

type TeamJoin = {
  id: number;
  name: string;
  slug: string;
  organizations:
    | { name: string; slug: string }
    | Array<{ name: string; slug: string }>
    | null;
};

type OwnTeamRow = {
  archived_at: string | null;
  id: number;
  role_title: string | null;
  team_id: number;
  teams: TeamJoin | TeamJoin[] | null;
};

type TeammateRow = {
  team_id: number;
  people:
    | { id: number; full_name: string | null; avatar_path: string | null }
    | Array<{ id: number; full_name: string | null; avatar_path: string | null }>
    | null;
};

type PortalMembershipRow = {
  ends_on: string | null;
  ended_at: string | null;
  joined_at: string;
  organization_id: number;
  person_id: number;
  starts_on: string | null;
  status: "active" | "ended";
};

type NewMemberRow = {
  joined_at: string;
  people:
    | {
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        field_of_study: string | null;
      }
    | Array<{
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        field_of_study: string | null;
      }>
    | null;
  person_id: number;
  starts_on: string | null;
};

/** How many teammate faces a team card shows before it falls back to a count. */
const TEAMMATE_FACES = 4;
const NEW_MEMBER_LIMIT = 8;
const RECENT_JOIN_WINDOW_DAYS = 30;

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** The day a membership actually began, whichever column carries it. */
function startDate(row: { starts_on: string | null; joined_at: string }) {
  return row.starts_on ?? row.joined_at.slice(0, 10);
}

function endDate(row: { ends_on: string | null; ended_at: string | null }) {
  return row.ends_on ?? row.ended_at?.slice(0, 10) ?? null;
}

export function formatMonth(isoDate: string) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Profile fields the portal shows to other members. They drive the member
 * directory and the statistics page, so an empty one costs everybody, not just
 * its owner — which is what makes completing them worth a dashboard action.
 */
export function missingProfileFields(profile: PortalProfile) {
  const fields: Array<[string, unknown]> = [
    ["name", profile.fullName],
    ["profile photo", profile.avatarPath],
    ["field of study", profile.fieldOfStudy],
    ["year of study", profile.studyYear],
    ["phone number", profile.phoneNumber],
    ["LinkedIn", profile.linkedinUrl],
  ];
  return {
    missing: fields.filter(([, value]) => !value).map(([label]) => label),
    total: fields.length,
  };
}

export async function loadDashboard({
  profile,
  isPortalAdmin,
  canReviewAccessRequests,
}: {
  profile: PortalProfile;
  isPortalAdmin: boolean;
  canReviewAccessRequests: boolean;
}): Promise<DashboardData> {
  const supabase = await createClient();

  const [
    membershipsResult,
    ownTeamsResult,
    portalMembershipsResult,
    accountsResult,
    accessRequestsResult,
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, role, status, joined_at, starts_on, ends_on, ended_at, organizations (id, name, slug, logo_path)",
      )
      .eq("person_id", profile.personId)
      .in("status", ["active", "ended"]),
    supabase
      .from("team_memberships")
      .select("id, role_title, team_id, archived_at, teams (id, name, slug, organizations (name, slug))")
      .eq("person_id", profile.personId),
    supabase
      .from("memberships")
      .select("person_id, organization_id, status, joined_at, starts_on, ends_on, ended_at")
      .in("status", ["active", "ended"]),
    supabase
      .from("portal_accounts")
      .select("auth_user_id", { count: "exact", head: true })
      .eq("person_id", profile.personId),
    // A request the signed-in person filed themselves is never theirs to
    // decide, so it must not inflate their review queue.
    canReviewAccessRequests
      ? supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .neq("person_id", profile.personId)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (
    membershipsResult.error ||
    ownTeamsResult.error ||
    portalMembershipsResult.error ||
    accountsResult.error ||
    accessRequestsResult.error
  ) {
    throw new Error("Could not load dashboard");
  }

  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[];
  const ownTeamRows = (ownTeamsResult.data ?? []) as OwnTeamRow[];
  const portalMembershipRows = (portalMembershipsResult.data ?? []) as PortalMembershipRow[];

  const teamIds = ownTeamRows.map((row) => row.team_id);
  const activeOrganizationIds = membershipRows
    .filter((row) => row.status === "active")
    .map((row) => single(row.organizations)?.id)
    .filter((id): id is number => typeof id === "number");

  const [teammatesResult, newMembersResult] = await Promise.all([
    teamIds.length > 0
      ? supabase
          .from("team_memberships")
          .select("team_id, people!team_memberships_person_id_fkey (id, full_name, avatar_path)")
          .in("team_id", teamIds)
          .is("archived_at", null)
          .order("sort_order")
      : Promise.resolve({ data: [] as TeammateRow[], error: null }),
    activeOrganizationIds.length > 0
      ? supabase
          .from("memberships")
          .select(
            "person_id, joined_at, starts_on, people (id, full_name, avatar_path, field_of_study)",
          )
          .eq("status", "active")
          .in("organization_id", activeOrganizationIds)
          .neq("person_id", profile.personId)
          .order("joined_at", { ascending: false })
          .limit(NEW_MEMBER_LIMIT * 3)
      : Promise.resolve({ data: [] as NewMemberRow[], error: null }),
  ]);

  if (teammatesResult.error || newMembersResult.error) {
    throw new Error("Could not load dashboard");
  }

  const teammateRows = (teammatesResult.data ?? []) as TeammateRow[];
  const newMemberRows = (newMembersResult.data ?? []) as NewMemberRow[];

  // Teams per organization, so an organization card can say how much of it the
  // signed-in person actually sits in.
  const teamCountByOrganization = new Map<string, number>();
  for (const row of ownTeamRows) {
    if (row.archived_at) continue;
    const organization = single(single(row.teams)?.organizations ?? null);
    if (!organization) continue;
    teamCountByOrganization.set(
      organization.slug,
      (teamCountByOrganization.get(organization.slug) ?? 0) + 1,
    );
  }

  const organizations: DashboardOrganization[] = membershipRows
    .map((row) => {
      const organization = single(row.organizations);
      if (!organization) return null;
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoPath: organization.logo_path,
        // An ended membership's old administrator role is history, never a
        // badge the dashboard still shows as current.
        role: row.status === "active" ? row.role : ("member" as MembershipRole),
        status: row.status,
        since: startDate(row),
        until: row.status === "ended" ? endDate(row) : null,
        teamCount: teamCountByOrganization.get(organization.slug) ?? 0,
      };
    })
    .filter((organization): organization is DashboardOrganization => Boolean(organization))
    .sort(
      (left, right) =>
        Number(right.status === "active") - Number(left.status === "active") ||
        left.name.localeCompare(right.name),
    );

  const teammatesByTeam = new Map<number, DashboardTeammate[]>();
  for (const row of teammateRows) {
    const person = single(row.people);
    if (!person || person.id === profile.personId) continue;
    const teammates = teammatesByTeam.get(row.team_id) ?? [];
    teammates.push({
      personId: person.id,
      name: person.full_name ?? "Unnamed member",
      avatarUrl: undefined,
    });
    teammatesByTeam.set(row.team_id, teammates);
  }
  const avatarPathByPerson = new Map<number, string | null>();
  for (const row of teammateRows) {
    const person = single(row.people);
    if (person) avatarPathByPerson.set(person.id, person.avatar_path);
  }
  for (const row of newMemberRows) {
    const person = single(row.people);
    if (person) avatarPathByPerson.set(person.id, person.avatar_path);
  }

  const avatarUrls = await getMemberAvatarUrls([
    profile.avatarPath,
    ...avatarPathByPerson.values(),
  ]);
  const avatarUrlFor = (personId: number) => {
    const path = avatarPathByPerson.get(personId);
    return path ? avatarUrls.get(path) : undefined;
  };

  const teams: DashboardTeam[] = ownTeamRows
    .map((row) => {
      const team = single(row.teams);
      const organization = single(team?.organizations ?? null);
      if (!team || !organization) return null;
      const teammates = teammatesByTeam.get(row.team_id) ?? [];
      return {
        id: row.id,
        name: team.name,
        slug: team.slug,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        roleTitle: row.role_title,
        isPast: Boolean(row.archived_at),
        memberCount: teammates.length + (row.archived_at ? 0 : 1),
        teammates: teammates.slice(0, TEAMMATE_FACES).map((teammate) => ({
          ...teammate,
          avatarUrl: avatarUrlFor(teammate.personId),
        })),
      };
    })
    .filter((team): team is DashboardTeam => Boolean(team))
    .sort(
      (left, right) =>
        Number(left.isPast) - Number(right.isPast) || left.name.localeCompare(right.name),
    );

  const seenNewMembers = new Set<number>();
  const newMembers: DashboardNewMember[] = [];
  for (const row of newMemberRows) {
    const person = single(row.people);
    if (!person || seenNewMembers.has(person.id)) continue;
    seenNewMembers.add(person.id);
    newMembers.push({
      personId: person.id,
      name: person.full_name ?? "Unnamed member",
      fieldOfStudy: person.field_of_study,
      joinedOn: startDate(row),
      avatarUrl: avatarUrlFor(person.id),
    });
    if (newMembers.length === NEW_MEMBER_LIMIT) break;
  }

  const activeMemberIds = new Set(
    portalMembershipRows.filter((row) => row.status === "active").map((row) => row.person_id),
  );
  // The same rule the statistics page counts alumni by: an ended membership
  // and no active one anywhere else.
  const alumniMemberIds = new Set(
    portalMembershipRows
      .filter((row) => row.status === "ended")
      .map((row) => row.person_id)
      .filter((personId) => !activeMemberIds.has(personId)),
  );
  const recentThreshold = new Date(
    Date.now() - RECENT_JOIN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const joinedLastMonth = new Set(
    portalMembershipRows
      .filter((row) => row.status === "active" && startDate(row) >= recentThreshold)
      .map((row) => row.person_id),
  ).size;

  const ownStartDates = membershipRows.map(startDate).sort();
  const { missing, total } = missingProfileFields(profile);

  return {
    actions: {
      missingProfileFields: missing,
      profileFieldCount: total,
      canLinkBackupAccount: (accountsResult.count ?? 1) < 2,
      pendingAccessRequests: isPortalAdmin || canReviewAccessRequests
        ? (accessRequestsResult.count ?? 0)
        : 0,
    },
    avatarUrl: profile.avatarPath ? avatarUrls.get(profile.avatarPath) : undefined,
    memberSince: ownStartDates[0] ?? null,
    newMembers,
    organizations,
    pulse: {
      activeMembers: activeMemberIds.size,
      alumni: alumniMemberIds.size,
      organizations: new Set(
        portalMembershipRows
          .filter((row) => row.status === "active")
          .map((row) => row.organization_id),
      ).size,
      joinedLastMonth,
    },
    teams,
  };
}
