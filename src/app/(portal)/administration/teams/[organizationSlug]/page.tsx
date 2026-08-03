import { notFound } from "next/navigation";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { TeamListManager, type ManagedTeam } from "@/components/portal/team-list-manager";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function TeamManagementPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const access = await requireOrganizationAdminAccess();
  const { organizationSlug } = await params;
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!administeredOrganization) notFound();

  const supabase = await createClient();
  const teamsResult = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("organization_id", administeredOrganization.organizationId)
    .eq("status", "active")
    .order("name");

  if (teamsResult.error) throw new Error("Could not load teams");

  const teamIds = teamsResult.data.map((team) => team.id);
  const membershipsResult = teamIds.length
    ? await supabase
        .from("team_memberships")
        .select("team_id")
        .in("team_id", teamIds)
        .is("archived_at", null)
    : { data: [] as { team_id: number }[], error: null };

  if (membershipsResult.error) throw new Error("Could not load team members");

  const memberCounts = new Map<number, number>();
  for (const membership of membershipsResult.data) {
    memberCounts.set(membership.team_id, (memberCounts.get(membership.team_id) ?? 0) + 1);
  }

  const teams: ManagedTeam[] = teamsResult.data.map((team) => ({
    id: team.id,
    memberCount: memberCounts.get(team.id) ?? 0,
    name: team.name,
    slug: team.slug,
  }));

  const hasSingleAdministeredOrganization = access.administeredOrganizations.length === 1;

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/administration/teams/${organizationSlug}`]: hasSingleAdministeredOrganization
            ? null
            : administeredOrganization.organizationName,
        }}
      />
      <TeamListManager
        organizationName={administeredOrganization.organizationName}
        organizationSlug={organizationSlug}
        teams={teams}
      />
    </>
  );
}
