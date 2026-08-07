import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  NorstecAccountCard,
  type NorstecAccount,
} from "@/components/portal/norstec-account-card";
import {
  PersonAdminActions,
  type MergeCandidate,
  type PersonAddress,
  type PersonSignInAccount,
} from "@/components/portal/person-admin-actions";
import { PersonAuditFeed } from "@/components/portal/person-audit-feed";
import {
  PersonOrganizationRoles,
  type PersonMembership,
} from "@/components/portal/person-organization-roles";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import {
  accessLevelLabels,
  deriveAccessLevel,
  derivePersonStatus,
  personStatusLabels,
} from "@/lib/portal/access-labels";
import {
  isWorkspaceConfigured,
  workspaceAdminUrl,
} from "@/lib/google/workspace";
import {
  hasNorstecEmail,
  NORSTEC_ORGANIZATION_SLUG,
} from "@/lib/portal/norstec";
import { loadPersonAudit } from "@/lib/portal/person-audit";
import { unlinkBlockMessage } from "@/lib/portal/unlink-blocks";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type PersonEmailRow = {
  email: string;
  email_type: string;
  is_primary: boolean;
};

type MembershipRow = {
  ended_at: string | null;
  id: number;
  joined_at: string;
  organizations:
    | { name: string; slug: string }
    | Array<{ name: string; slug: string }>
    | null;
  role: string;
  status: string;
};

type MembershipPeriodRow = {
  ends_on: string | null;
  membership_id: number;
  starts_on: string;
};

type PersonRow = {
  access_requests: Array<{
    created_at: string;
    organizations: { name: string } | Array<{ name: string }> | null;
    request_type: string;
    status: string;
  }>;
  alumni_access_granted_at: string | null;
  avatar_path: string | null;
  created_at: string;
  deleted_at: string | null;
  deletion_reason: string | null;
  field_of_study: string | null;
  full_name: string | null;
  id: number;
  memberships: MembershipRow[];
  person_emails: PersonEmailRow[];
  portal_access_status: "unclaimed" | "active" | "suspended";
  portal_accounts: Array<{
    account_email: string;
    auth_user_id: string;
    last_seen_at: string;
    linked_at: string;
    onboarding_status: string;
  }>;
  // A one-to-one embed: the administrator table is keyed by person_id.
  portal_administrators: { granted_at: string } | null;
  study_year: number | null;
};

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Fact({
  children,
  term,
}: {
  children: React.ReactNode;
  term: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="section-label opacity-45">{term}</dt>
      <dd className="mt-2 font-medium break-words">{children}</dd>
    </div>
  );
}

export default async function PortalPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const access = await requirePortalAdminAccess();
  const { personId: personIdParameter } = await params;
  const personId = Number(personIdParameter);

  if (!Number.isSafeInteger(personId) || personId <= 0) notFound();

  const supabase = await createClient();
  const [personResult, candidatesResult] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, full_name, field_of_study, study_year, avatar_path, portal_access_status, created_at, deleted_at, deletion_reason, alumni_access_granted_at, person_emails (email, email_type, is_primary), portal_accounts (auth_user_id, account_email, linked_at, last_seen_at, onboarding_status), portal_administrators!portal_administrators_person_id_fkey (granted_at), memberships (id, role, status, joined_at, ended_at, organizations (name, slug)), access_requests!access_requests_person_id_fkey (status, request_type, created_at, organizations (name))",
      )
      .eq("id", personId)
      .maybeSingle(),
    supabase
      .from("people")
      .select(
        "id, full_name, avatar_path, person_emails (email, is_primary), portal_accounts (account_email), portal_administrators!portal_administrators_person_id_fkey (person_id), memberships (status, organizations (name))",
      )
      .is("deleted_at", null)
      .neq("id", personId)
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  if (personResult.error || candidatesResult.error) {
    throw new Error("Could not load this person");
  }
  if (!personResult.data) notFound();

  const person = personResult.data as unknown as PersonRow;

  // A deleted person is administered from Deleted people, where the only two
  // decisions left — restore or purge — live. Nothing on this page applies to
  // them, so the route stops existing the moment they are deleted.
  if (person.deleted_at) notFound();

  // Periods are read on their own rather than embedded under memberships. The
  // embed depends on PostgREST resolving the relationship from its schema
  // cache, which is exactly what was missing on the deployed project while
  // membership_periods was absent there; a plain table read cannot drift that
  // way.
  const [periodsResult, workspaceResult, auditEntries] = await Promise.all([
    supabase
      .from("membership_periods")
      .select("membership_id, starts_on, ends_on")
      .in(
        "membership_id",
        person.memberships.map((membership) => membership.id),
      ),
    supabase
      .from("external_accounts")
      .select(
        "account_email, external_id, status, last_synced_at, organizations!inner (slug)",
      )
      .eq("person_id", personId)
      .eq("provider", "google_workspace")
      .eq("organizations.slug", NORSTEC_ORGANIZATION_SLUG)
      .maybeSingle(),
    loadPersonAudit(personId),
  ]);

  if (periodsResult.error) {
    throw new Error("Could not load membership history");
  }

  // A missing Norstec account is the normal case, not a failure: most people
  // in the portal are members of other organizations and never get one.
  const norstecAccount: NorstecAccount | null = workspaceResult.data
    ? {
        accountEmail: workspaceResult.data.account_email,
        adminUrl: workspaceResult.data.external_id
          ? workspaceAdminUrl(workspaceResult.data.external_id)
          : null,
        lastSyncedAt: workspaceResult.data.last_synced_at,
        status: workspaceResult.data.status as NorstecAccount["status"],
      }
    : null;

  const periodsByMembership = new Map<number, MembershipPeriodRow[]>();
  for (const period of periodsResult.data as MembershipPeriodRow[]) {
    const existing = periodsByMembership.get(period.membership_id) ?? [];
    existing.push(period);
    periodsByMembership.set(period.membership_id, existing);
  }

  const candidateRows = candidatesResult.data as Array<{
    avatar_path: string | null;
    full_name: string | null;
    id: number;
    memberships: Array<{
      organizations: { name: string } | Array<{ name: string }> | null;
      status: string;
    }>;
    person_emails: Array<{ email: string; is_primary: boolean }>;
    portal_accounts: Array<{ account_email: string }>;
    portal_administrators: { person_id: number } | null;
  }>;
  // One signing round covers this person and everyone the merge search can
  // offer, so picking a duplicate shows a face rather than initials.
  const avatarUrls = await getMemberAvatarUrls([
    person.avatar_path,
    ...candidateRows.map((candidate) => candidate.avatar_path),
  ]);
  const avatarUrl = person.avatar_path
    ? avatarUrls.get(person.avatar_path)
    : undefined;
  const name = person.full_name ?? "Unnamed person";
  const isSelf = person.id === access.profile.personId;
  const emails = [...person.person_emails].sort(
    (left, right) => Number(right.is_primary) - Number(left.is_primary),
  );
  const primaryEmail = emails[0]?.email ?? null;
  const activeMemberships = person.memberships.filter(
    (membership) => membership.status === "active",
  );
  const endedMemberships = person.memberships.filter(
    (membership) => membership.status === "ended",
  );
  const pendingRequests = person.access_requests.filter(
    (request) => request.status === "pending",
  );
  const organizationNames = activeMemberships
    .map((membership) => single(membership.organizations)?.name)
    .filter((organizationName): organizationName is string =>
      Boolean(organizationName),
    );
  // The same guard the removal runs, asked ahead of time. A page cannot work
  // it out for itself: it reads organization domains, which live in `private`.
  const unlinkBlocks = await Promise.all(
    person.portal_accounts.map(async (account) => {
      const { data } = await supabase.rpc("portal_account_unlink_block", {
        p_auth_user_id: account.auth_user_id,
      });
      return [account.auth_user_id, data ?? null] as const;
    }),
  );
  const unlinkBlockByAccount = new Map(unlinkBlocks);
  const personAccounts: PersonSignInAccount[] = person.portal_accounts.map(
    (account) => ({
      authUserId: account.auth_user_id,
      blockedReason: unlinkBlockMessage(
        unlinkBlockByAccount.get(account.auth_user_id) ?? null,
        "admin",
      ),
      email: account.account_email,
      isOnboarding: account.onboarding_status === "pending",
    }),
  );
  // One list rather than two, because the two operations are ordered: an
  // address cannot be removed while an account still signs in with it. An
  // account whose address is not on the profile — the conflict a Workspace
  // rename can leave behind — still has to be reachable, so it appears as its
  // own row rather than disappearing.
  const accountByEmail = new Map(
    personAccounts.map((account) => [account.email, account]),
  );
  const personAddresses: PersonAddress[] = [
    ...emails.map((email) => ({
      account: accountByEmail.get(email.email) ?? null,
      email: email.email,
      isPrimary: email.is_primary,
    })),
    ...personAccounts
      .filter((account) => !emails.some((email) => email.email === account.email))
      .map((account) => ({
        account,
        email: account.email,
        isPrimary: false,
      })),
  ];
  const lastSignInAt = person.portal_accounts
    .map((account) => account.last_seen_at)
    .sort()
    .at(-1);
  // Only Norstec's own people have a Workspace account, so for everybody else
  // the section had nothing to say and said it anyway. Membership is the
  // question, but not the whole of it: someone who signed in with a norstec.no
  // address before their membership was recorded still has an account to
  // administer, and so does someone the directory has already matched.
  const belongsToNorstec =
    Boolean(norstecAccount) ||
    person.memberships.some(
      (membership) =>
        single(membership.organizations)?.slug === NORSTEC_ORGANIZATION_SLUG,
    ) ||
    hasNorstecEmail([
      ...emails.map((email) => email.email),
      ...person.portal_accounts.map((account) => account.account_email),
    ]);
  // Both derived exactly as Manage people derives them, so a person reads the
  // same in the table and on their own page.
  const derivedStatus =
    personStatusLabels[
      derivePersonStatus({
        activeMembershipCount: activeMemberships.length,
        deletedAt: person.deleted_at,
        endedMembershipCount: endedMemberships.length,
        hasAlumniAccess: Boolean(person.alumni_access_granted_at),
      })
    ];
  const derivedAccessLevel =
    accessLevelLabels[
      deriveAccessLevel({
        hasActiveMembership: activeMemberships.length > 0,
        hasAlumniAccess: Boolean(person.alumni_access_granted_at),
        hasEndedMembership: endedMemberships.length > 0,
        isOrganizationAdmin: activeMemberships.some(
          (membership) => membership.role === "organization_admin",
        ),
        isPortalAdmin: Boolean(person.portal_administrators),
        isSuspended: person.portal_access_status === "suspended",
      })
    ];

  const memberships: PersonMembership[] = activeMemberships.map(
    (membership) => ({
      id: membership.id,
      organizationName:
        single(membership.organizations)?.name ?? "Unknown organization",
      periods: (periodsByMembership.get(membership.id) ?? []).map((period) => ({
        endsOn: period.ends_on,
        startsOn: period.starts_on,
      })),
      role:
        membership.role === "organization_admin" ? "organization_admin" : "member",
    }),
  );

  const mergeCandidates: MergeCandidate[] = candidateRows
    // Neither a portal administrator nor a Norstec account is ever the
    // profile that gets folded in and removed — `merge_people` refuses both
    // — so neither is offered as a duplicate. Merging into one of them is
    // done from their own page.
    .filter(
      (candidate) =>
        !candidate.portal_administrators &&
        !hasNorstecEmail([
          ...candidate.person_emails.map((email) => email.email),
          ...candidate.portal_accounts.map((account) => account.account_email),
        ]),
    )
    .map((candidate) => {
      const candidateEmails = [...candidate.person_emails].sort(
        (left, right) => Number(right.is_primary) - Number(left.is_primary),
      );
      return {
        // Named rather than counted: a merge that brings an active membership
        // onto the surviving profile makes them a member of an organization
        // nobody decided to admit them to, and the dialog has to say which.
        activeOrganizations: candidate.memberships
          .filter((membership) => membership.status === "active")
          .map((membership) => single(membership.organizations)?.name)
          .filter((name): name is string => Boolean(name)),
        avatarUrl: candidate.avatar_path
          ? avatarUrls.get(candidate.avatar_path)
          : undefined,
        email: candidateEmails[0]?.email ?? null,
        id: candidate.id,
        name: candidate.full_name ?? "Unnamed person",
      } satisfies MergeCandidate;
    });

  return (
    <>
      <PortalBreadcrumbData labels={{ [`/admin/people/${personId}`]: name }} />

      <section aria-labelledby="person-identity-heading">
        <div className="flex flex-wrap items-center gap-5">
          <MemberAvatar name={name} size="large" src={avatarUrl} />
          <div className="min-w-0">
            <h1 className="text-h2" id="person-identity-heading">
              {name}
            </h1>
          </div>
        </div>

        <dl className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          <Fact term="Status">{derivedStatus}</Fact>
          <Fact term="Access">{derivedAccessLevel}</Fact>
          <Fact term="Organization">
            {organizationNames.length > 0 ? organizationNames.join(", ") : "—"}
          </Fact>
          <Fact term="Contact email">{primaryEmail ?? "—"}</Fact>
          <Fact term="Field of study">{person.field_of_study ?? "—"}</Fact>
          <Fact term="Study year">{person.study_year ?? "—"}</Fact>
          <Fact term="Added to the portal">{formatDate(person.created_at)}</Fact>
          <Fact term="Last sign-in">
            {lastSignInAt ? formatDate(lastSignInAt) : "Never signed in"}
          </Fact>
        </dl>
      </section>

      <PersonOrganizationRoles
        accessStatus={person.portal_access_status}
        isSelf={isSelf}
        memberships={memberships}
        personId={person.id}
        personName={name}
      >
        {pendingRequests.length > 0 && (
          <div className="mt-8">
            <h3 className="text-h3">Pending access requests</h3>
            <ul className="mt-3 grid gap-2 text-sm">
              {pendingRequests.map((request) => (
                <li key={`${request.request_type}-${request.created_at}`}>
                  {request.request_type === "alumni"
                    ? "Alumni access"
                    : (single(request.organizations)?.name ??
                      "Unknown organization")}{" "}
                  <span className="opacity-55">
                    · requested {formatDate(request.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PersonOrganizationRoles>

      <PersonAdminActions
        accessStatus={person.portal_access_status}
        norstecAccountStatus={
          norstecAccount?.status === "active" ||
          norstecAccount?.status === "suspended"
            ? norstecAccount.status
            : null
        }
        isPortalAdmin={Boolean(person.portal_administrators)}
        isSelf={isSelf}
        mergeCandidates={mergeCandidates}
        personAddresses={personAddresses}
        personEmails={emails.map((email) => email.email)}
        personId={person.id}
        personName={name}
      >
        {belongsToNorstec && (
          <NorstecAccountCard
            account={norstecAccount}
            personId={person.id}
            personName={name}
            workspaceConfigured={isWorkspaceConfigured()}
          />
        )}
        <PersonAuditFeed entries={auditEntries} />
      </PersonAdminActions>
    </>
  );
}
