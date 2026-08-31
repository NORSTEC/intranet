import {
  WorkspaceDirectory,
  type WorkspaceDirectoryRow,
} from "@/components/portal/workspace-directory";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import {
  isWorkspaceConfigured,
  workspaceAdminUrl,
} from "@/lib/google/workspace";
import { NORSTEC_ORGANIZATION_SLUG } from "@/lib/portal/norstec";
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
  provider_details: unknown;
  status: string;
};

/**
 * `provider_details` is whatever the last sync wrote, so every read of it is a
 * guess until proven otherwise. A row written before this was stored renders
 * with the keys it has rather than throwing on the ones it does not.
 */
function detailOf(details: unknown, key: string) {
  if (!details || typeof details !== "object") return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function adminRoleOf(details: unknown): WorkspaceDirectoryRow["adminRole"] {
  const value = detailOf(details, "adminRole");
  return value === "super_admin" || value === "delegated_admin"
    ? value
    : "member";
}

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function WorkspaceAccountsPage() {
  await requirePortalAdminAccess();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_accounts")
    .select(
      "person_id, external_id, account_email, display_name, status, last_synced_at, provider_details, organizations!inner (slug), people (full_name, avatar_path)",
    )
    .eq("provider", "google_workspace")
    .eq("organizations.slug", NORSTEC_ORGANIZATION_SLUG)
    .order("account_email", { ascending: true });

  if (error) {
    throw new Error("Could not load the Workspace directory");
  }

  const rows = data as unknown as DirectoryRow[];

  // One signing round for every linked person, so the table shows the same
  // faces Manage people does rather than falling back to initials.
  const avatarUrls = await getMemberAvatarUrls(
    rows.map((row) => single(row.people)?.avatar_path ?? null),
  );

  const accounts: WorkspaceDirectoryRow[] = rows.flatMap((row) => {
    // A row without Google's user id predates the sync and cannot be linked
    // back to an account in the Admin console, so there is nothing useful to
    // show for it. The next sync either fills it in or removes it.
    if (!row.external_id || !row.account_email) return [];

    const person = single(row.people);
    return [
      {
        accountEmail: row.account_email,
        adminRole: adminRoleOf(row.provider_details),
        adminUrl: workspaceAdminUrl(row.external_id),
        avatarUrl: person?.avatar_path
          ? avatarUrls.get(person.avatar_path)
          : undefined,
        displayName: row.display_name,
        externalId: row.external_id,
        lastLoginAt: detailOf(row.provider_details, "lastLoginAt"),
        personId: row.person_id,
        personName: person?.full_name ?? null,
        suspended: row.status === "suspended",
      } satisfies WorkspaceDirectoryRow,
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
        What the norstec.no Google Workspace contains, and how much of it the
        intranet recognises. Account type and account status are both from Google Workspace, and neither says anything about intranet access.
      </p>

      <div className="mt-10">
        <WorkspaceDirectory
          accounts={accounts}
          lastSyncedAt={lastSyncedAt}
          workspaceConfigured={isWorkspaceConfigured()}
        />
      </div>
    </>
  );
}
