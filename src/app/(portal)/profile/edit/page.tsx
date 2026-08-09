import { saveProfile } from "@/app/(portal)/profile/actions";
import { AddTeamExperience } from "@/components/portal/add-team-experience";
import { ExperienceRolesEditor } from "@/components/portal/experience-roles-editor";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import { ProfileImageEditor } from "@/components/portal/profile-image-editor";
import {
  ProfileEditForm,
  ProfileEditorActions,
} from "@/components/portal/profile-edit-form";
import { Toast } from "@/components/portal/toast";
import { requirePortalAccess } from "@/lib/auth/access";
import { STUDY_FIELDS } from "@/lib/profile/study-fields";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type ExperienceRole = {
  id: number;
  team_name: string;
  role_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  updated_at: string;
};

type ProfileExperience = {
  id: number;
  organization_id: number | null;
  organization_name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  updated_at: string;
  organizations:
    | { logo_path: string | null }
    | Array<{ logo_path: string | null }>
    | null;
  profile_experience_roles: ExperienceRole[];
};

const errorMessages: Record<string, string> = {
  invalid_profile: "Check the profile fields and try again.",
  invalid_avatar: "Choose a JPG, PNG, WebP, or AVIF image up to 5 MB.",
  avatar_upload_failed: "The profile image could not be uploaded.",
  invalid_experience: "Check the experience fields and dates and try again.",
  profile_conflict:
    "Your profile changed after this page was opened. Review the latest values and try again.",
  profile_update_failed: "The profile could not be saved.",
  contact_email_failed:
    "Your profile was saved, but the contact email could not be changed.",
};

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const access = await requirePortalAccess();
  const { error } = await searchParams;
  const supabase = await createClient();
  const [
    personResult,
    experiencesResult,
    organizationsResult,
    teamsResult,
    emailsResult,
    avatarUrls,
  ] = await Promise.all([
      supabase
        .from("people")
        .select("profile_updated_at, directory_visible")
        .eq("id", access.profile.personId)
        .single(),
      supabase
        .from("profile_experiences")
        .select(
          "id, organization_id, organization_name, description, starts_on, ends_on, updated_at, organizations (logo_path), profile_experience_roles (id, team_name, role_title, starts_on, ends_on, updated_at)",
        )
        .eq("person_id", access.profile.personId)
        .order("starts_on", { ascending: false, nullsFirst: false }),
      supabase
        .from("organizations")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("teams")
        .select("id, name, organization_id")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("person_emails")
        .select("email, is_primary")
        .eq("person_id", access.profile.personId)
        .order("email"),
      getMemberAvatarUrls([access.profile.avatarPath]),
    ]);

  if (
    personResult.error ||
    experiencesResult.error ||
    organizationsResult.error ||
    teamsResult.error ||
    emailsResult.error
  ) {
    throw new Error("Could not load editable profile");
  }

  const experiences = experiencesResult.data as ProfileExperience[];
  const avatarUrl = access.profile.avatarPath
    ? avatarUrls.get(access.profile.avatarPath)
    : undefined;
  const contactEmail =
    emailsResult.data.find((personEmail) => personEmail.is_primary)?.email ??
    emailsResult.data[0]?.email ??
    null;
  const hasLegacyStudyField = Boolean(
    access.profile.fieldOfStudy &&
      !(STUDY_FIELDS as readonly string[]).includes(access.profile.fieldOfStudy),
  );
  const status = access.memberships.some((membership) => membership.status === "active")
    ? "Active"
    : access.memberships.some((membership) => membership.status === "ended")
      ? "Alumni"
      : "Pending";

  return (
    <>
    <ProfileEditForm action={saveProfile}>
      <input
        name="expectedProfileUpdatedAt"
        type="hidden"
        value={personResult.data.profile_updated_at}
      />

      {error && <Toast clearParams={["error"]} message={errorMessages[error] ?? "The profile could not be saved."} status="error" />}

      <div className="mb-8 flex min-h-11 items-center justify-end overflow-x-auto">
        <ProfileEditorActions />
      </div>

      <section className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-center lg:gap-12">
        <ProfileImageEditor
          alt={access.profile.avatarAlt ?? access.profile.fullName ?? "Profile image"}
          initialUrl={avatarUrl}
        />

        <div>
          <h1 className="text-h2">
            {access.profile.fullName ?? access.profile.email}
          </h1>
          <input
            name="fullName"
            type="hidden"
            value={access.profile.fullName ?? access.profile.email}
          />
          <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="section-label opacity-45">Status</dt>
              <dd className="profile-value mt-2 font-medium">{status}</dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Phone</dt>
              <dd className="mt-1 font-medium">
                <input
                  aria-label="Phone"
                  className="profile-edit-field"
                  defaultValue={access.profile.phoneNumber ?? ""}
                  inputMode="tel"
                  maxLength={40}
                  name="phoneNumber"
                  placeholder="Not provided"
                />
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Field of study</dt>
              <dd className="mt-1 font-medium">
                <select
                  aria-label="Field of study"
                  className="profile-edit-field"
                  defaultValue={access.profile.fieldOfStudy ?? ""}
                  name="fieldOfStudy"
                >
                  <option value="">Not provided</option>
                  {hasLegacyStudyField && (
                    <option value={access.profile.fieldOfStudy ?? ""}>
                      {access.profile.fieldOfStudy}
                    </option>
                  )}
                  {STUDY_FIELDS.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Study year</dt>
              <dd className="mt-1 font-medium">
                <select
                  aria-label="Study year"
                  className="profile-edit-field"
                  defaultValue={access.profile.studyYear ?? ""}
                  name="studyYear"
                >
                  <option value="">Not provided</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Contact email</dt>
              <dd className="mt-1 font-medium">
                {/* The address other members see. Which Google accounts sign
                    you in is a separate question, answered under Sign-in
                    accounts — an address can be either, both, or neither. */}
                <select
                  aria-label="Contact email"
                  className="profile-edit-field"
                  defaultValue={contactEmail ?? ""}
                  name="contactEmail"
                >
                  {emailsResult.data.map((personEmail) => (
                    <option key={personEmail.email} value={personEmail.email}>
                      {personEmail.email}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
          </dl>
          <label className="mt-8 block h-11 max-w-lg">
            <input
              aria-label="LinkedIn"
              className="profile-linkedin-field"
              defaultValue={access.profile.linkedinUrl ?? ""}
              maxLength={2048}
              name="linkedinUrl"
              placeholder="LinkedIn profile URL"
              type="url"
            />
          </label>

          <label className="portal-surface mt-6 flex max-w-2xl cursor-pointer items-start gap-4 p-5">
            <input
              className="mt-1 size-4 shrink-0"
              defaultChecked={personResult.data.directory_visible}
              name="directoryVisible"
              type="checkbox"
              value="true"
            />
            <span>
              <span className="block font-medium">Show me to other members</span>
              <span className="mt-1 block text-sm leading-relaxed opacity-60">
                Turn this off to hide your profile, memberships, teams, roles,
                and contact details from member directories. You and authorized
                administrators can still see them.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="mt-20">
        <AddTeamExperience
          organizations={organizationsResult.data}
          teams={teamsResult.data}
        />
        <div className="mt-8 grid gap-6">
          {experiences.map((experience) => {
            const organization = Array.isArray(experience.organizations)
              ? experience.organizations[0]
              : experience.organizations;
            return (
              <article
                className="profile-experience-card portal-surface px-6 pb-5 pt-6 transition-opacity sm:px-8 sm:pb-6 sm:pt-8"
                key={experience.id}
              >
                <input name="experienceId" type="hidden" value={experience.id} />
                <input
                  name={`experience-${experience.id}-expectedUpdatedAt`}
                  type="hidden"
                  value={experience.updated_at}
                />
                <input
                  name={`experience-${experience.id}-organizationId`}
                  type="hidden"
                  value={experience.organization_id ?? ""}
                />
                <header className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="section-label opacity-45">Organization <span className="text-copper" aria-hidden="true">*</span></p>
                    </div>
                    <input
                      aria-label="Organization name"
                      className="portal-field mt-2 max-w-lg"
                      defaultValue={experience.organization_name}
                      maxLength={160}
                      name={`experience-${experience.id}-organizationName`}
                      required
                    />
                    <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="section-label opacity-45">From</span>
                        <input className="portal-field profile-date-field" defaultValue={experience.starts_on ?? ""} name={`experience-${experience.id}-startsOn`} aria-label={`${experience.organization_name} start date`} lang="en-GB" type="date" />
                      </label>
                      <label className="grid gap-2">
                        <span className="section-label opacity-45">To</span>
                        <input className="portal-field profile-date-field" defaultValue={experience.ends_on ?? ""} name={`experience-${experience.id}-endsOn`} aria-label={`${experience.organization_name} end date`} lang="en-GB" type="date" />
                      </label>
                    </div>
                    <textarea
                      aria-label={`${experience.organization_name} description`}
                      className="portal-field mt-3 min-h-20 max-w-2xl resize-y"
                      defaultValue={experience.description ?? ""}
                      maxLength={2000}
                      name={`experience-${experience.id}-description`}
                      placeholder="Describe the work, responsibilities, or results"
                    />
                  </div>
                  {organization?.logo_path && (
                    <OrganizationLogo logoPath={organization.logo_path} name={experience.organization_name} size="experience" />
                  )}
                </header>

                <ExperienceRolesEditor
                  experienceId={experience.id}
                  experienceUpdatedAt={experience.updated_at}
                  roles={experience.profile_experience_roles}
                  suggestedTeams={teamsResult.data
                    .filter((team) => team.organization_id === experience.organization_id)
                    .map((team) => team.name)}
                />
              </article>
            );
          })}
        </div>
      </section>

      <div className="mt-10 flex min-h-11 items-center justify-end overflow-x-auto">
        <ProfileEditorActions />
      </div>
    </ProfileEditForm>
    </>
  );
}
