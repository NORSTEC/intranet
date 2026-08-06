import { SLACK_ICON } from "@/components/portal/card-icon";
import { AccessWelcome } from "@/components/portal/dashboard/access-welcome";
import { DashboardHero } from "@/components/portal/dashboard/dashboard-hero";
import { NewMemberCard } from "@/components/portal/dashboard/new-member-card";
import { OrganizationCard } from "@/components/portal/dashboard/organization-card";
import { PortalPulse } from "@/components/portal/dashboard/portal-pulse";
import {
  RecommendedActions,
  type RecommendedAction,
} from "@/components/portal/dashboard/recommended-actions";
import { TeamCard } from "@/components/portal/dashboard/team-card";
import { requirePortalAccess } from "@/lib/auth/access";
import { formatMonth, loadDashboard } from "@/lib/portal/dashboard";

/** A list an English sentence can carry: "A, B and C". */
function sentenceList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function greetingName(fullName: string | null, firstName: string | null, email: string) {
  return firstName ?? fullName?.split(/\s+/)[0] ?? email.split("@")[0];
}

export default async function DashboardPage() {
  const access = await requirePortalAccess();
  // Portal administrators decide alumni requests without holding any
  // organization admin role, so the review action has to reach them too.
  const canReviewAccessRequests =
    access.isPortalAdmin ||
    access.memberships.some(
      (membership) => membership.status === "active" && membership.role === "organization_admin",
    );

  const dashboard = await loadDashboard({
    profile: access.profile,
    isPortalAdmin: access.isPortalAdmin,
    canReviewAccessRequests,
  });

  const activeOrganizations = dashboard.organizations.filter(
    (organization) => organization.status === "active",
  );
  const isAlumni = activeOrganizations.length === 0;
  const lastEnded = dashboard.organizations.find((organization) => organization.until);

  const displayName = access.profile.fullName ?? access.profile.email;
  // The role and the membership date are separate facts: holding the portal
  // administrator role today says nothing about when it was granted, so the
  // date belongs to the membership sentence alone.
  const organizationNames = sentenceList(
    activeOrganizations.map((organization) => organization.name),
  );
  // Two organizations joined in different months are two facts, and one shared
  // "since" would misdate whichever came second — so each organization carries
  // its own date unless they genuinely share one.
  const membershipMonths = activeOrganizations.map((organization) =>
    formatMonth(organization.since),
  );
  const sharedMonth = membershipMonths.every((month) => month === membershipMonths[0]);
  const membershipSentence = isAlumni
    ? lastEnded?.until
      ? `You hold alumni access to the portal. Your membership in ${lastEnded.name} ended ${formatMonth(lastEnded.until)}.`
      : "You hold alumni access to the portal."
    : sharedMonth
      ? `Member of ${organizationNames} since ${membershipMonths[0]}.`
      : `Member of ${sentenceList(
          activeOrganizations.map(
            (organization, index) => `${organization.name} since ${membershipMonths[index]}`,
          ),
        )}.`;
  const roleSentence = access.isPortalAdmin
    ? " You administer the portal."
    : !isAlumni && activeOrganizations.some((organization) => organization.role === "organization_admin")
      ? ` You administer ${sentenceList(
          activeOrganizations
            .filter((organization) => organization.role === "organization_admin")
            .map((organization) => organization.name),
        )}.`
      : "";
  const subtitle = `${membershipSentence}${roleSentence}`;

  const {
    missingProfileFields,
    profileFieldCount,
    canLinkBackupAccount,
    pendingAccessRequests,
    unmatchedWorkspaceAccounts,
    unmatchedSlackAccounts,
  } = dashboard.actions;
  const actions: RecommendedAction[] = [];
  if (unmatchedWorkspaceAccounts > 0) {
    actions.push({
      description:
        unmatchedWorkspaceAccounts === 1
          ? "1 account in the norstec.no Google Workspace belongs to nobody in the portal."
          : `${unmatchedWorkspaceAccounts} accounts in the norstec.no Google Workspace belong to nobody in the portal.`,
      href: "/admin/workspace",
      icon: "cloud",
      title: "Google accounts to review",
    });
  }
  if (unmatchedSlackAccounts > 0) {
    actions.push({
      description:
        unmatchedSlackAccounts === 1
          ? "1 account in the Norstec Slack workspace belongs to nobody in the portal."
          : `${unmatchedSlackAccounts} accounts in the Norstec Slack workspace belong to nobody in the portal.`,
      href: "/admin/slack",
      icon: SLACK_ICON,
      title: "Slack accounts to review",
    });
  }
  if (pendingAccessRequests > 0) {
    actions.push({
      description:
        pendingAccessRequests === 1
          ? "1 person is waiting for a decision on portal access."
          : `${pendingAccessRequests} people are waiting for a decision on portal access.`,
      href: "/administration/access-requests",
      icon: "person_check",
      title: "Access requests waiting",
    });
  }
  if (missingProfileFields.length > 0) {
    actions.push({
      description: `${profileFieldCount - missingProfileFields.length} of ${profileFieldCount} details filled in — missing ${sentenceList(missingProfileFields)}.`,
      href: "/profile/edit",
      icon: "person_edit",
      title: "Finish your profile",
    });
  }
  if (canLinkBackupAccount) {
    actions.push({
      description:
        "If your organization closes your student or work account, a second Google account keeps you signed in.",
      href: "/profile#login-accounts-heading",
      icon: "shield_person",
      title: "Add a backup sign-in account",
    });
  }

  return (
    <div className="dashboard-page space-y-16 lg:space-y-20">
      <DashboardHero
        avatarUrl={dashboard.avatarUrl}
        greetingName={greetingName(
          access.profile.fullName,
          access.profile.firstName,
          access.profile.email,
        )}
        name={displayName}
        subtitle={subtitle}
      />

      {dashboard.welcome && <AccessWelcome welcome={dashboard.welcome} />}

      <RecommendedActions actions={actions} />

      {dashboard.organizations.length > 0 && (
        <section aria-labelledby="organizations-heading" className="dashboard-rise">
          <h2 className="text-h2" id="organizations-heading">
            Your organizations
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.organizations.map((organization) => (
              <OrganizationCard key={organization.id} organization={organization} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="teams-heading" className="dashboard-rise">
        <h2 className="text-h2" id="teams-heading">
          Your teams
        </h2>
        {dashboard.teams.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.teams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        ) : (
          <p className="portal-surface mt-6 p-6 text-sm opacity-55 sm:p-8">
            You are not on a team yet. Your organization adds you to one, and teams you were part of
            earlier can be recorded on your profile.
          </p>
        )}
      </section>

      {dashboard.newMembers.length > 0 && (
        <section aria-labelledby="new-members-heading" className="dashboard-rise">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-h2" id="new-members-heading">
              New around you
            </h2>
            <p className="text-sm opacity-55">The most recent members of {organizationNames}</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {dashboard.newMembers.map((member) => (
              <NewMemberCard key={member.personId} member={member} />
            ))}
          </div>
        </section>
      )}

      <PortalPulse pulse={dashboard.pulse} />
    </div>
  );
}
