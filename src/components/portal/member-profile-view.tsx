import Image from "next/image";
import type { ReactNode } from "react";
import { OrganizationLogo } from "@/components/portal/organization-logo";

export type MemberProfileExperience = {
  id: number;
  description?: string | null;
  startsOn: string | null;
  endsOn: string | null;
  organization: {
    logoPath: string | null;
    name: string;
  };
  teams: Array<{
    id: number;
    roleTitle: string | null;
    startsOn: string | null;
    endsOn: string | null;
    name: string;
  }>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatPeriod(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return "Dates not added";
  if (!startsOn) return `Until ${formatMonth(endsOn!)}`;
  return `${formatMonth(startsOn)} – ${endsOn ? formatMonth(endsOn) : "Present"}`;
}

function groupTeamRoles(teams: MemberProfileExperience["teams"]) {
  return teams.reduce<Array<{
    name: string;
    roles: MemberProfileExperience["teams"];
  }>>((groups, role) => {
    const existing = groups.find((group) => group.name === role.name);
    if (existing) existing.roles.push(role);
    else groups.push({ name: role.name, roles: [role] });
    return groups;
  }, []);
}

export function MemberProfileView({
  accountSettings,
  action,
  avatarAlt,
  avatarUrl,
  dangerZone,
  email,
  experience,
  fieldOfStudy,
  linkedinUrl,
  name,
  organizationName,
  phoneNumber,
  status,
  studyYear,
}: {
  accountSettings?: ReactNode;
  action?: ReactNode;
  avatarAlt?: string | null;
  avatarUrl?: string;
  dangerZone?: ReactNode;
  email: string | null;
  experience: MemberProfileExperience[];
  fieldOfStudy: string | null;
  linkedinUrl: string | null;
  name: string;
  organizationName: string | null;
  phoneNumber: string | null;
  status: string;
  studyYear: number | null;
}) {
  return (
    <>
      {action && (
        <div className="mb-8 flex min-h-11 items-center justify-end overflow-x-auto">
          {action}
        </div>
      )}
      <section className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-center lg:gap-12">
        <div className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-moody-static">
          {avatarUrl ? (
            <Image
              alt={avatarAlt ?? name}
              className="object-cover"
              fill
              priority
              sizes="(min-width: 1024px) 320px, 90vw"
              src={avatarUrl}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-5xl font-medium text-egg-static">
              {initials(name)}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-h2">{name}</h1>

          <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="section-label opacity-45">Status</dt>
              <dd className="profile-value mt-2 font-medium">{status}</dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Organization</dt>
              <dd className="profile-value mt-2 font-medium">
                {organizationName ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Phone</dt>
              <dd className="profile-value mt-2 font-medium">
                {phoneNumber ? (
                  <a
                    className="transition-colors hover:text-copper"
                    href={`tel:${phoneNumber.replace(/[^+\d]/g, "")}`}
                  >
                    {phoneNumber}
                  </a>
                ) : (
                  "Not provided"
                )}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Field of study</dt>
              <dd className="profile-value mt-2 font-medium">
                {fieldOfStudy ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Study year</dt>
              <dd className="profile-value mt-2 font-medium">
                {studyYear ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="section-label opacity-45">Contact email</dt>
              <dd className="profile-value mt-2 font-medium break-words">
                {email ? (
                  <a
                    className="transition-colors hover:text-copper"
                    href={`mailto:${email}`}
                  >
                    {email}
                  </a>
                ) : (
                  "Not provided"
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-8 h-11">
            {linkedinUrl && (
              <a
                className="portal-button h-11 w-fit"
                href={linkedinUrl}
                rel="noreferrer"
                target="_blank"
              >
                LinkedIn
                <span className="material-symbols-outlined text-[1.15rem]">
                  open_in_new
                </span>
              </a>
            )}
          </div>
        </div>
      </section>

      {accountSettings}

      <section className="mt-20">
        <h2 className="text-h2">Experience</h2>
        <div className="mt-8 grid gap-6">
          {experience.map((entry) => (
            <article
              className="portal-surface px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8"
              key={entry.id}
            >
              <header className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="section-label opacity-45">Organization</p>
                  <h3 className="mt-2 text-2xl font-medium">
                    {entry.organization.name}
                  </h3>
                  <p className="mt-3 text-sm font-medium opacity-55">
                    {formatPeriod(entry.startsOn, entry.endsOn)}
                  </p>
                  {entry.description && (
                    <p className="mt-4 max-w-3xl text-sm leading-relaxed opacity-65">
                      {entry.description}
                    </p>
                  )}
                </div>
                <OrganizationLogo
                  logoPath={entry.organization.logoPath}
                  name={entry.organization.name}
                  size="experience"
                />
              </header>

              <div className="mt-10">
                <p className="section-label opacity-45">Teams and roles</p>
                {entry.teams.length > 0 ? (
                  <div className="mt-2 grid gap-x-12 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                    {groupTeamRoles(entry.teams).map((team) => (
                      <div key={team.name}>
                        <h4 className="text-xl font-medium">{team.name}</h4>
                        {team.roles.some((role) => role.roleTitle) && (
                          <div className="mt-3 grid gap-4">
                            {team.roles
                              .filter((role) => role.roleTitle)
                              .map((role) => (
                                <div key={role.id}>
                                  <p className="font-medium text-sky">
                                    {role.roleTitle}
                                  </p>
                                  <p className="mt-1 text-sm opacity-55">
                                    {formatPeriod(role.startsOn, role.endsOn)}
                                  </p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 text-sm opacity-50">
                    No teams or roles added.
                  </p>
                )}
              </div>
            </article>
          ))}
          {experience.length === 0 && (
            <p className="text-sm opacity-55">No experience added.</p>
          )}
        </div>
      </section>

      {dangerZone}
    </>
  );
}
