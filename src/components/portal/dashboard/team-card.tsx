import Link from "next/link";
import { MemberAvatar } from "@/components/portal/member-avatar";
import type { DashboardTeam } from "@/lib/portal/dashboard";

export function TeamCard({ team }: { team: DashboardTeam }) {
  const hiddenTeammates = Math.max(team.memberCount - 1 - team.teammates.length, 0);

  return (
    <Link
      className="portal-surface portal-card-link group flex min-h-56 flex-col p-6"
      href={`/organizations/${team.organizationSlug}/teams/${team.slug}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="portal-pill portal-pill-filled">{team.organizationName}</span>
        {team.isPast && <span className="portal-pill portal-pill-filled">Past</span>}
      </div>

      <h3 className="mt-7 text-2xl font-medium uppercase">{team.name}</h3>
      <p className="mt-2 text-sm opacity-55">
        {team.roleTitle ?? (team.isPast ? "Former member" : "Member")}
      </p>

      <div className="mt-auto flex items-center justify-between gap-4 pt-8">
        {team.teammates.length > 0 ? (
          <span className="dashboard-avatar-stack flex items-center">
            {team.teammates.map((teammate) => (
              <MemberAvatar key={teammate.personId} name={teammate.name} src={teammate.avatarUrl} />
            ))}
            {hiddenTeammates > 0 && (
              <span className="portal-surface flex size-11 items-center justify-center rounded-full text-xs font-semibold">
                +{hiddenTeammates}
              </span>
            )}
            {/* The avatars are decorative images, so the roster only reaches a
                screen reader if it is spelled out. */}
            <span className="sr-only">
              {team.memberCount} {team.memberCount === 1 ? "member" : "members"}, including{" "}
              {team.teammates.map((teammate) => teammate.name).join(", ")}
            </span>
          </span>
        ) : (
          <span className="text-sm opacity-55">Only you, so far</span>
        )}
        <span
          aria-hidden="true"
          className="material-symbols-outlined transition-transform group-hover:translate-x-1"
        >
          trending_flat
        </span>
      </div>
    </Link>
  );
}
