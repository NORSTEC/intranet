import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  PersonAdminActions,
  type MergeCandidate,
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
  personStatusLabels,
} from "@/lib/portal/access-labels";
import { loadPersonAudit } from "@/lib/portal/person-audit";
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
  organizations: { name: string } | Array<{ name: string }> | null;
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
        "id, full_name, field_of_study, study_year, avatar_path, portal_access_status, created_at, deleted_at, deletion_reason, person_emails (email, email_type, is_primary), portal_accounts (account_email, linked_at, last_seen_at, onboarding_status), portal_administrators!portal_administrators_person_id_fkey (granted_at), memberships (id, role, status, joined_at, ended_at, organizations (name)), access_requests!access_requests_person_id_fkey (status, request_type, created_at, organizations (name))",
      )
      .eq("id", personId)
      .maybeSingle(),
    supabase
      .from("people")
      .select("id, full_name, person_emails (email, is_primary)")
      .is("deleted_at", null)
      .neq("id", personId)
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  if (personResult.error || candidatesResult.error) {
    throw new Error("Could not load this person");
  }
  if (!personResult.data) notFound();

  const person = personResult.data as unknown as PersonRow;

  // A deleted person is administered from Deleted users, where the only two
  // decisions left — restore or purge — live. Nothing on this page applies to
  // them, so the route stops existing the moment they are deleted.
  if (person.deleted_at) notFound();

  // Periods are read on their own rather than embedded under memberships. The
  // embed depends on PostgREST resolving the relationship from its schema
  // cache, which is exactly what was missing on the deployed project while
  // membership_periods was absent there; a plain table read cannot drift that
  // way.
  const [periodsResult, auditEntries] = await Promise.all([
    supabase
      .from("membership_periods")
      .select("membership_id, starts_on, ends_on")
      .in(
        "membership_id",
        person.memberships.map((membership) => membership.id),
      ),
    loadPersonAudit(personId),
  ]);

  if (periodsResult.error) {
    throw new Error("Could not load membership history");
  }

  const periodsByMembership = new Map<number, MembershipPeriodRow[]>();
  for (const period of periodsResult.data as MembershipPeriodRow[]) {
    const existing = periodsByMembership.get(period.membership_id) ?? [];
    existing.push(period);
    periodsByMembership.set(period.membership_id, existing);
  }

  const avatarUrls = await getMemberAvatarUrls([person.avatar_path]);
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
    .concat(endedMemberships)
    .map((membership) => single(membership.organizations)?.name)
    .filter((organizationName): organizationName is string =>
      Boolean(organizationName),
    );
  // A Google account that already is the person's primary address is the same
  // fact twice; only the extra sign-in accounts belong under Linked accounts.
  const linkedAccounts = person.portal_accounts.filter(
    (account) =>
      account.account_email.toLocaleLowerCase("en") !==
      primaryEmail?.toLocaleLowerCase("en"),
  );
  const lastSignInAt = person.portal_accounts
    .map((account) => account.last_seen_at)
    .sort()
    .at(-1);
  // Both derived exactly as Manage users derives them, so a person reads the
  // same in the table and on their own page.
  const derivedStatus = personStatusLabels[
    person.deleted_at
      ? "deleted"
      : activeMemberships.length > 0
        ? "active"
        : endedMemberships.length > 0
          ? "alumni"
          : "none"
  ];
  const derivedAccessLevel =
    accessLevelLabels[
      person.portal_access_status === "suspended"
        ? "suspended"
        : person.portal_administrators
          ? "portal_admin"
          : activeMemberships.some(
                (membership) => membership.role === "organization_admin",
              )
            ? "organization_admin"
            : "member"
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

  const mergeCandidates: MergeCandidate[] = (
    candidatesResult.data as Array<{
      full_name: string | null;
      id: number;
      person_emails: Array<{ email: string; is_primary: boolean }>;
    }>
  ).map((candidate) => {
    const candidateEmails = [...candidate.person_emails].sort(
      (left, right) => Number(right.is_primary) - Number(left.is_primary),
    );
    return {
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
          <Fact term="Primary email">{primaryEmail ?? "—"}</Fact>
          <Fact term="Linked accounts">
            {linkedAccounts.length > 0 ? (
              <ul className="grid gap-1">
                {linkedAccounts.map((account) => (
                  <li key={account.account_email}>
                    {account.account_email}
                    {account.onboarding_status === "pending" && (
                      <span className="font-normal opacity-55">
                        {" · onboarding"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </Fact>
          <Fact term="Field of study">{person.field_of_study ?? "—"}</Fact>
          <Fact term="Study year">{person.study_year ?? "—"}</Fact>
          <Fact term="Profile created">{formatDate(person.created_at)}</Fact>
          <Fact term="Last sign-in">
            {lastSignInAt ? formatDate(lastSignInAt) : "Never signed in"}
          </Fact>
        </dl>
      </section>

      <PersonOrganizationRoles
        canGrantAdmin={person.portal_access_status === "active"}
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
        isPortalAdmin={Boolean(person.portal_administrators)}
        isSelf={isSelf}
        mergeCandidates={mergeCandidates}
        personEmails={emails.map((email) => email.email)}
        personId={person.id}
        personName={name}
      >
        <PersonAuditFeed entries={auditEntries} />
      </PersonAdminActions>
    </>
  );
}
