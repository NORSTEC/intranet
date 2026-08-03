import Link from "next/link";
import {
  LoginAccountsSettings,
  type LinkedLoginAccount,
} from "@/components/portal/login-accounts-settings";
import { MemberProfileView } from "@/components/portal/member-profile-view";
import { Toast } from "@/components/portal/toast";
import { requirePortalAccess } from "@/lib/auth/access";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

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
  const loginAccounts: LinkedLoginAccount[] = accountsResult.data
    .map((account) => {
      const email = account.account_email.toLocaleLowerCase("en");
      const emailRecord = emailsByAddress.get(email);
      return {
        email,
        emailType:
          emailRecord?.email_type === "organization" ||
          emailRecord?.email_type === "personal"
            ? emailRecord.email_type
            : "unknown",
        id: account.auth_user_id,
        isPrimary: emailRecord?.is_primary ?? false,
      } satisfies LinkedLoginAccount;
    })
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));

  const status = access.memberships.some((membership) => membership.status === "active")
    ? "Active"
    : access.memberships.some((membership) => membership.status === "ended")
      ? "Alumni"
      : "Pending";
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
          message={accountLinkError === "limit"
              ? "You can only connect one alternative Google account."
            : accountLinkError === "same"
              ? "Choose a different Google account."
            : accountLinkError === "profile_has_data"
              ? "That account belongs to a portal profile with existing data. Contact Norstec IT to merge the profiles."
            : accountLinkError === "expired"
              ? "The account-link request expired. Please try again."
            : "The Google account could not be linked. Please try again."}
          status="error"
        />
      )}
      <MemberProfileView
        accountSettings={(
          <LoginAccountsSettings
            accounts={loginAccounts}
            canLeavePortal={status === "Alumni" && !access.isPortalAdmin}
          />
        )}
        action={
          <Link className="portal-button" href="/profile/edit">
            <span className="material-symbols-outlined text-[1.1rem]">edit</span>
            Edit profile
          </Link>
        }
        avatarAlt={access.profile.avatarAlt}
        avatarUrl={avatarUrl}
        emails={emailsResult.data}
        experience={experience}
        fieldOfStudy={access.profile.fieldOfStudy}
        linkedinUrl={access.profile.linkedinUrl}
        name={name}
        phoneNumber={access.profile.phoneNumber}
        status={status}
        studyYear={access.profile.studyYear}
      />
    </>
  );
}
