import { notFound } from "next/navigation";
import { saveTeamSettings } from "@/app/(portal)/administration/teams/[organizationSlug]/[teamSlug]/actions";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { TeamEditForm, TeamEditorActions } from "@/components/portal/team-edit-form";
import {
  TeamMembersEditor,
  type TeamOrganizationMember,
} from "@/components/portal/team-members-editor";
import { Toast } from "@/components/portal/toast";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type MembershipRow = {
  id: number;
  status: "active" | "ended";
  people:
    | { id: number; avatar_path: string | null; full_name: string | null }
    | Array<{ id: number; avatar_path: string | null; full_name: string | null }>;
};

const errorMessages: Record<string, string> = {
  invalid_team: "Check the team fields and try again.",
  team_conflict:
    "The team changed after this page was opened. Review the latest values and try again.",
  team_update_failed: "The team could not be saved.",
};

export default async function TeamSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const access = await requireOrganizationAdminAccess();
  const { organizationSlug, teamSlug } = await params;
  const { error, saved } = await searchParams;
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!administeredOrganization) notFound();

  const supabase = await createClient();
  const teamResult = await supabase
    .from("teams")
    .select("id, name, description, updated_at")
    .eq("organization_id", administeredOrganization.organizationId)
    .eq("slug", teamSlug)
    .eq("status", "active")
    .maybeSingle();

  if (teamResult.error) throw new Error("Could not load team");
  if (!teamResult.data) notFound();

  const team = teamResult.data;

  const [membershipsResult, teamMembershipsResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, status, people!memberships_person_id_fkey (id, full_name, avatar_path)")
      .eq("organization_id", administeredOrganization.organizationId)
      .in("status", ["active", "ended"])
      .order("status")
      .order("full_name", {
        referencedTable: "people",
        ascending: true,
        nullsFirst: false,
      }),
    supabase
      .from("team_memberships")
      .select("person_id")
      .eq("team_id", team.id)
      .is("archived_at", null),
  ]);

  if (membershipsResult.error) throw new Error("Could not load organization members");
  if (teamMembershipsResult.error) throw new Error("Could not load team members");

  const currentMemberIds = new Set(
    teamMembershipsResult.data.map((membership) => membership.person_id),
  );

  const organizationMemberRows = (membershipsResult.data as MembershipRow[]).flatMap(
    (membership) => {
      const person = Array.isArray(membership.people)
        ? membership.people[0]
        : membership.people;
      if (!person) return [];
      return [
        {
          avatarPath: person.avatar_path,
          isFormerMember: membership.status === "ended",
          name: person.full_name ?? "Unnamed member",
          personId: person.id,
        },
      ];
    },
  );

  const avatarUrls = await getMemberAvatarUrls(
    organizationMemberRows.map((member) => member.avatarPath),
  );

  const organizationMembers: TeamOrganizationMember[] = organizationMemberRows.map(
    (member) => ({
      avatarUrl: member.avatarPath ? avatarUrls.get(member.avatarPath) : undefined,
      isFormerMember: member.isFormerMember,
      name: member.name,
      personId: member.personId,
    }),
  );

  const hasSingleAdministeredOrganization = access.administeredOrganizations.length === 1;

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/administration/teams/${organizationSlug}`]: hasSingleAdministeredOrganization
            ? null
            : administeredOrganization.organizationName,
          [`/administration/teams/${organizationSlug}/${teamSlug}`]: team.name,
        }}
      />

      <TeamEditForm action={saveTeamSettings}>
        <input name="organizationSlug" type="hidden" value={organizationSlug} />
        <input name="teamSlug" type="hidden" value={teamSlug} />
        <input name="teamId" type="hidden" value={team.id} />
        <input name="expectedUpdatedAt" type="hidden" value={team.updated_at} />

        {saved === "true" && (
          <Toast clearParams={["saved"]} message="Changes saved." status="success" />
        )}
        {error && (
          <Toast
            clearParams={["error"]}
            message={errorMessages[error] ?? "The team could not be saved."}
            status="error"
          />
        )}

        <div className="mb-8 flex min-h-11 items-center justify-end overflow-x-auto">
          <TeamEditorActions />
        </div>

        <section className="grid gap-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="section-label opacity-45">
              Name <span aria-hidden="true" className="text-copper">*</span>
            </span>
            <input
              className="portal-field mt-3"
              defaultValue={team.name}
              maxLength={160}
              name="name"
              required
            />
          </label>

          <label className="sm:col-span-2">
            <span className="section-label opacity-45">Description</span>
            <textarea
              className="portal-field mt-3 min-h-32 resize-y"
              defaultValue={team.description ?? ""}
              maxLength={5000}
              name="description"
              placeholder="General information shown on the team page."
            />
          </label>
        </section>

        <TeamMembersEditor
          initialMemberIds={[...currentMemberIds]}
          members={organizationMembers}
        />

        <div className="mt-10 flex min-h-11 items-center justify-end overflow-x-auto">
          <TeamEditorActions />
        </div>
      </TeamEditForm>
    </>
  );
}
