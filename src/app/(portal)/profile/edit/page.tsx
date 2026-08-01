import Link from "next/link";
import {
  removeTeamHistory,
  saveTeamHistory,
  updateOrganizationHistory,
  updatePersonalProfile,
} from "@/app/(portal)/profile/actions";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type OrganizationMembership = {
  id: number;
  organization_id: number;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  organizations:
    | { id: number; name: string; slug: string }
    | Array<{ id: number; name: string; slug: string }>;
};

type TeamMembership = {
  id: number;
  team_id: number;
  role_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  teams:
    | { id: number; name: string; organization_id: number }
    | Array<{ id: number; name: string; organization_id: number }>;
};

const errorMessages: Record<string, string> = {
  invalid_profile: "Check the profile fields and try again.",
  profile_update_failed: "The profile could not be updated.",
  invalid_history: "Check the organization dates and try again.",
  history_update_failed: "The organization history could not be updated.",
  invalid_team_history: "Add a role and valid dates before saving.",
  team_history_update_failed: "The team history could not be updated.",
};

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const access = await requirePortalAccess();
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const [membershipsResult, teamMembershipsResult] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, organization_id, starts_on, ends_on, status, organizations (id, name, slug)",
      )
      .eq("person_id", access.profile.personId)
      .in("status", ["active", "alumni", "ended"])
      .order("starts_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("team_memberships")
      .select(
        "id, team_id, role_title, starts_on, ends_on, teams (id, name, organization_id)",
      )
      .eq("person_id", access.profile.personId)
      .order("starts_on", { ascending: false, nullsFirst: false }),
  ]);

  if (membershipsResult.error || teamMembershipsResult.error) {
    throw new Error("Could not load editable profile history");
  }

  const memberships = membershipsResult.data as OrganizationMembership[];
  const teamMemberships = teamMembershipsResult.data as TeamMembership[];
  const editableOrganizationIds = memberships
    .filter((membership) => ["active", "alumni", "ended"].includes(membership.status))
    .map((membership) => membership.organization_id);
  const teamsResult = editableOrganizationIds.length
    ? await supabase
        .from("teams")
        .select("id, name, organization_id")
        .in("organization_id", editableOrganizationIds)
        .eq("status", "active")
        .order("name")
    : { data: [], error: null };

  if (teamsResult.error) throw new Error("Could not load available teams");

  const existingTeamIds = new Set(teamMemberships.map((membership) => membership.team_id));
  const availableTeams = teamsResult.data.filter((team) => !existingTeamIds.has(team.id));
  const organizationNames = new Map(
    memberships.flatMap((membership) => {
      const organization = Array.isArray(membership.organizations)
        ? membership.organizations[0]
        : membership.organizations;
      return organization ? [[organization.id, organization.name] as const] : [];
    }),
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2">Edit profile</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-55">
            Keep your contact information and Norstec experience up to date.
          </p>
        </div>
        <Link className="portal-button" href="/profile">
          Done
        </Link>
      </div>

      {(error || saved) && (
        <p
          className={`mt-6 text-sm font-medium ${error ? "text-copper" : ""}`}
          role="status"
        >
          {error ? errorMessages[error] ?? "The change could not be saved." : "Changes saved."}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-medium">Personal information</h2>
        <form action={updatePersonalProfile} className="portal-surface mt-5 p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="section-label">Name</span>
              <input
                className="portal-field"
                defaultValue={access.profile.fullName ?? ""}
                maxLength={160}
                name="fullName"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="section-label">Phone</span>
              <input
                className="portal-field"
                defaultValue={access.profile.phoneNumber ?? ""}
                inputMode="tel"
                maxLength={40}
                name="phoneNumber"
                placeholder="+47 900 00 000"
              />
            </label>
            <label className="grid gap-2">
              <span className="section-label">Field of study</span>
              <input
                className="portal-field"
                defaultValue={access.profile.fieldOfStudy ?? ""}
                maxLength={160}
                name="fieldOfStudy"
              />
            </label>
            <label className="grid gap-2">
              <span className="section-label">Study year</span>
              <input
                className="portal-field"
                defaultValue={access.profile.studyYear ?? ""}
                max={10}
                min={1}
                name="studyYear"
                type="number"
              />
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <span className="section-label">LinkedIn</span>
              <input
                className="portal-field"
                defaultValue={access.profile.linkedinUrl ?? ""}
                maxLength={2048}
                name="linkedinUrl"
                placeholder="https://www.linkedin.com/in/..."
                type="url"
              />
            </label>
          </div>
          <button className="portal-button mt-6" type="submit">
            Save personal information
          </button>
        </form>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-medium">Organization history</h2>
        <p className="mt-2 text-sm opacity-55">
          Your organizations are predefined. Add the dates shown on your profile.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {memberships.map((membership) => {
            const organization = Array.isArray(membership.organizations)
              ? membership.organizations[0]
              : membership.organizations;
            if (!organization) return null;

            return (
              <form
                action={updateOrganizationHistory}
                className="portal-surface p-6"
                key={membership.id}
              >
                <input name="membershipId" type="hidden" value={membership.id} />
                <h3 className="text-lg font-medium">{organization.name}</h3>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <label className="grid gap-2">
                    <span className="section-label">Start</span>
                    <input
                      className="portal-field"
                      defaultValue={membership.starts_on ?? ""}
                      name="startsOn"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="section-label">End</span>
                    <input
                      className="portal-field"
                      defaultValue={membership.ends_on ?? ""}
                      name="endsOn"
                      type="date"
                    />
                  </label>
                </div>
                <button className="portal-button mt-5" type="submit">
                  Save dates
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-medium">Team history</h2>
        <p className="mt-2 text-sm opacity-55">
          Choose a team from one of your organizations and describe your role.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {teamMemberships.map((membership) => {
            const team = Array.isArray(membership.teams)
              ? membership.teams[0]
              : membership.teams;
            if (!team) return null;

            return (
              <article className="portal-surface p-6" key={membership.id}>
                <p className="section-label opacity-45">
                  {organizationNames.get(team.organization_id)}
                </p>
                <h3 className="mt-2 text-lg font-medium">{team.name}</h3>
                <form action={saveTeamHistory} className="mt-5">
                  <input
                    name="teamMembershipId"
                    type="hidden"
                    value={membership.id}
                  />
                  <input name="teamId" type="hidden" value={team.id} />
                  <label className="grid gap-2">
                    <span className="section-label">Role</span>
                    <input
                      className="portal-field"
                      defaultValue={membership.role_title ?? ""}
                      maxLength={160}
                      name="roleTitle"
                      required
                    />
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <label className="grid gap-2">
                      <span className="section-label">Start</span>
                      <input
                        className="portal-field"
                        defaultValue={membership.starts_on ?? ""}
                        name="startsOn"
                        type="date"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="section-label">End</span>
                      <input
                        className="portal-field"
                        defaultValue={membership.ends_on ?? ""}
                        name="endsOn"
                        type="date"
                      />
                    </label>
                  </div>
                  <button className="portal-button mt-5" type="submit">
                    Save role
                  </button>
                </form>
                <form action={removeTeamHistory} className="mt-3">
                  <input
                    name="teamMembershipId"
                    type="hidden"
                    value={membership.id}
                  />
                  <button className="text-sm transition-colors hover:text-copper" type="submit">
                    Remove from history
                  </button>
                </form>
              </article>
            );
          })}

          {availableTeams.length > 0 && (
            <form action={saveTeamHistory} className="portal-surface p-6">
              <h3 className="text-lg font-medium">Add team experience</h3>
              <label className="mt-5 grid gap-2">
                <span className="section-label">Team</span>
                <select className="portal-field" name="teamId" required>
                  <option value="">Choose a team</option>
                  {availableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {organizationNames.get(team.organization_id)} · {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 grid gap-2">
                <span className="section-label">Role</span>
                <input className="portal-field" maxLength={160} name="roleTitle" required />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <label className="grid gap-2">
                  <span className="section-label">Start</span>
                  <input className="portal-field" name="startsOn" type="date" />
                </label>
                <label className="grid gap-2">
                  <span className="section-label">End</span>
                  <input className="portal-field" name="endsOn" type="date" />
                </label>
              </div>
              <button className="portal-button mt-5" type="submit">
                Add experience
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
