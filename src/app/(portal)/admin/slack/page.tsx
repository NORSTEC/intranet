import {
  SlackDirectory,
  type SlackDirectoryRow,
} from "@/components/portal/slack-directory";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { NORSTEC_ORGANIZATION_SLUG } from "@/lib/portal/norstec";
import {
  isSlackConfigured,
  slackProfileUrl,
  slackTeamDomain,
} from "@/lib/slack/directory";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type DirectoryPerson = {
  avatar_path: string | null;
  full_name: string | null;
};

type DirectoryRow = {
  account_email: string | null;
  display_name: string | null;
  external_id: string | null;
  last_synced_at: string | null;
  people: DirectoryPerson | DirectoryPerson[] | null;
  person_id: number | null;
  status: string;
};

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * The workspace subdomain is the one part of a Slack profile link that cannot
 * be derived from a user id, and reading it is a call to Slack. A failure there
 * must not take the page down with it: the report is still worth reading
 * without the outbound links, and an administrator who cannot see the table at
 * all has no way to find out why.
 */
async function profileLinkBuilder() {
  if (!isSlackConfigured()) return () => null;

  try {
    const domain = await slackTeamDomain();
    if (!domain) return () => null;
    return (externalId: string) => slackProfileUrl(domain, externalId);
  } catch {
    return () => null;
  }
}

export default async function SlackAccountsPage() {
  await requirePortalAdminAccess();

  const supabase = await createClient();
  const [{ data, error }, buildProfileUrl] = await Promise.all([
    supabase
      .from("external_accounts")
      .select(
        "person_id, external_id, account_email, display_name, status, last_synced_at, organizations!inner (slug), people (full_name, avatar_path)",
      )
      .eq("provider", "slack")
      .eq("organizations.slug", NORSTEC_ORGANIZATION_SLUG)
      .order("account_email", { ascending: true }),
    profileLinkBuilder(),
  ]);

  if (error) {
    throw new Error("Could not load the Slack directory");
  }

  const rows = data as unknown as DirectoryRow[];

  // One signing round for every linked person, so the table shows the same
  // faces Manage people does rather than falling back to initials.
  const avatarUrls = await getMemberAvatarUrls(
    rows.map((row) => single(row.people)?.avatar_path ?? null),
  );

  const accounts: SlackDirectoryRow[] = rows.flatMap((row) => {
    // Without Slack's user id there is nothing to link back to and nothing the
    // next sync can reconcile against. The address may legitimately be missing;
    // the id may not.
    if (!row.external_id) return [];

    const person = single(row.people);
    return [
      {
        accountEmail: row.account_email,
        avatarUrl: person?.avatar_path
          ? avatarUrls.get(person.avatar_path)
          : undefined,
        deactivated: row.status === "suspended",
        displayName: row.display_name,
        externalId: row.external_id,
        personId: row.person_id,
        personName: person?.full_name ?? null,
        profileUrl: buildProfileUrl(row.external_id),
      } satisfies SlackDirectoryRow,
    ];
  });

  const lastSyncedAt =
    rows
      .map((row) => row.last_synced_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Who is in the Norstec Slack workspace, and how much of it the portal
        recognises. Reading only — deactivating a Slack member is not something
        the portal can do, so acting on a row means opening it in Slack.
      </p>

      <div className="mt-10">
        <SlackDirectory
          accounts={accounts}
          lastSyncedAt={lastSyncedAt}
          slackConfigured={isSlackConfigured()}
        />
      </div>
    </>
  );
}
