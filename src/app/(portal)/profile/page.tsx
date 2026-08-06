import Link from "next/link";
import { DeleteAccountSettings } from "@/components/portal/delete-account-settings";
import {
  LoginAccountsSettings,
  type LinkedLoginAccount,
} from "@/components/portal/login-accounts-settings";
import { MemberProfileView } from "@/components/portal/member-profile-view";
import { Toast } from "@/components/portal/toast";
import { requirePortalAccess } from "@/lib/auth/access";
import { unlinkBlockMessage } from "@/lib/portal/unlink-blocks";
import {
  derivePersonStatus,
  personStatusLabels,
} from "@/lib/portal/access-labels";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

const accountLinkErrors: Record<string, string> = {
  expired: "The account-link request expired. Please try again.",
  limit: "You can only connect one alternative Google account.",
  oauth: "Google sign-in could not be completed. Please try again.",
  profile_has_data:
    "That account belongs to a portal profile with existing data. Contact NORSTEC IT to merge the profiles.",
  same: "Choose a different Google account.",
  source_inactive:
    "That account belongs to a portal profile without portal access. Contact NORSTEC IT.",
  start: "Account linking could not be started. Please try again.",
};

type ProfileExperience = {
  id: number;
  organization_name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  organizations:
    | { logo_path: string | null }
    | Array<{ logo_path: string | null }>
    | null;
  profile_experience_roles: Array<{
    id: number;
    role_title: string | null;
    starts_on: string | null;
    ends_on: string | null;
    team_name: string;
  }>;
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    accountLinked?: string;
    accountLinkError?: string;
    saved?: string;
  }>;
}) {
  const access = await requirePortalAccess();
  const { accountLinked, accountLinkError, saved } = await searchParams;
  const supabase = await createClient();
  const [experiencesResult, emailsResult, accountsResult, avatarUrls] =
    await Promise.all([
      supabase
        .from("profile_experiences")
        .select(
          "id, organization_name, description, starts_on, ends_on, organizations (logo_path), profile_experience_roles (id, team_name, role_title, starts_on, ends_on)",
        )
        .eq("person_id", access.profile.personId)
        .order("starts_on", { ascending: false, nullsFirst: false }),
      supabase
        .from("person_emails")
        .select("id, email, email_type, is_primary")
        .eq("person_id", access.profile.personId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("portal_accounts")
        .select("auth_user_id, account_email")
        .eq("person_id", access.profile.personId),
      getMemberAvatarUrls([access.profile.avatarPath]),
    ]);

  if (
    experiencesResult.error ||
    emailsResult.error ||
    accountsResult.error
  ) {
    throw new Error("Could not load profile");
  }

  const emailsByAddress = new Map(
    emailsResult.data.map((email) => [email.email, email]),
  );
  // Asked per account rather than guessed: the rule reads organization domains
  // in the private schema, which a page cannot see. At most two calls.
  const unlinkBlocks = await Promise.all(
    accountsResult.data.map(async (account) => {
      const { data } = await supabase.rpc("portal_account_unlink_block", {
        p_auth_user_id: account.auth_user_id,
      });
      return [account.auth_user_id, data ?? null] as const;
    }),
  );
  const unlinkBlockByAccount = new Map(unlinkBlocks);
  const loginAccounts: LinkedLoginAccount[] = accountsResult.data
    .map((account) => {
      const email = account.account_email.toLocaleLowerCase("en");
      const emailRecord = emailsByAddress.get(email);
      return {
        blockedReason: unlinkBlockMessage(
          unlinkBlockByAccount.get(account.auth_user_id) ?? null,
          "self",
        ),
        email,
        emailType:
          emailRecord?.email_type === "organization" ||
          emailRecord?.email_type === "personal"
            ? emailRecord.email_type
            : "unknown",
        id: account.auth_user_id,
        isCurrentSession: account.auth_user_id === access.profile.userId,
      } satisfies LinkedLoginAccount;
    })
    // The account in use comes first. Neither account is the contact address
    // any more — that is a property of an address, not of a sign-in.
    .sort(
      (left, right) =>
        Number(right.isCurrentSession) - Number(left.isCurrentSession) ||
        left.email.localeCompare(right.email),
    );
  const primaryEmail =
    emailsResult.data.find((personEmail) => personEmail.is_primary)?.email ??
    null;
  const status =
    personStatusLabels[
      derivePersonStatus({
        activeMembershipCount: access.memberships.filter(
          (membership) => membership.status === "active",
        ).length,
        deletedAt: null,
        endedMembershipCount: access.memberships.filter(
          (membership) => membership.status === "ended",
        ).length,
        hasAlumniAccess: access.hasAlumniAccess,
      })
    ];
  const organizationName =
    access.memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.organizationName)
      .join(", ") || null;
  const experience = (experiencesResult.data as ProfileExperience[]).map((entry) => {
    const organization = Array.isArray(entry.organizations)
      ? entry.organizations[0]
      : entry.organizations;
    return {
      id: entry.id,
      description: entry.description,
      startsOn: entry.starts_on,
      endsOn: entry.ends_on,
      organization: {
        logoPath: organization?.logo_path ?? null,
        name: entry.organization_name,
      },
      teams: entry.profile_experience_roles.map((role) => ({
          id: role.id,
          roleTitle: role.role_title,
          startsOn: role.starts_on,
          endsOn: role.ends_on,
          name: role.team_name,
        })),
    };
  });
  const name = access.profile.fullName ?? access.profile.email;
  const avatarUrl = access.profile.avatarPath
    ? avatarUrls.get(access.profile.avatarPath)
    : undefined;

  return (
    <>
      {saved === "true" && (
        <Toast clearParams={["saved"]} message="Changes saved." status="success" />
      )}
      {accountLinked === "true" && (
        <Toast
          clearParams={["accountLinked"]}
          message="Google account linked."
          status="success"
        />
      )}
      {accountLinkError && (
        <Toast
          clearParams={["accountLinkError"]}
          message={
            accountLinkErrors[accountLinkError] ??
            "The Google account could not be linked. Please try again."
          }
          status="error"
        />
      )}
      <MemberProfileView
        accountSettings={<LoginAccountsSettings accounts={loginAccounts} />}
        action={
          <Link className="portal-button" href="/profile/edit">
            <span className="material-symbols-outlined text-[1.1rem]">edit</span>
            Edit profile
          </Link>
        }
        avatarAlt={access.profile.avatarAlt}
        avatarUrl={avatarUrl}
        dangerZone={<DeleteAccountSettings />}
        email={primaryEmail}
        experience={experience}
        fieldOfStudy={access.profile.fieldOfStudy}
        linkedinUrl={access.profile.linkedinUrl}
        name={name}
        organizationName={organizationName}
        phoneNumber={access.profile.phoneNumber}
        status={status}
        studyYear={access.profile.studyYear}
      />
    </>
  );
}
