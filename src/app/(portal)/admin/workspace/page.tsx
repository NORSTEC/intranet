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
import { createClient } from "@/lib/supabase/server";

type DirectoryRow = {
  account_email: string | null;
  display_name: string | null;
  external_id: string | null;
  last_synced_at: string | null;
  people: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  person_id: number | null;
  status: string;
};

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
      "person_id, external_id, account_email, display_name, status, last_synced_at, organizations!inner (slug), people (full_name)",
    )
    .eq("provider", "google_workspace")
    .eq("organizations.slug", NORSTEC_ORGANIZATION_SLUG)
    .order("account_email", { ascending: true });

  if (error) {
    throw new Error("Could not load the Workspace directory");
  }

  const rows = data as unknown as DirectoryRow[];

  const accounts: WorkspaceDirectoryRow[] = rows.flatMap((row) =>
    // A row without Google's user id predates the sync and cannot be linked
    // back to an account in the Admin console, so there is nothing useful to
    // show for it. The next sync either fills it in or removes it.
    row.external_id && row.account_email
      ? [
          {
            accountEmail: row.account_email,
            adminUrl: workspaceAdminUrl(row.external_id),
            displayName: row.display_name,
            externalId: row.external_id,
            personId: row.person_id,
            personName: single(row.people)?.full_name ?? null,
            suspended: row.status === "suspended",
          } satisfies WorkspaceDirectoryRow,
        ]
      : [],
  );

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
        portal recognises. Accounts are never created or deleted from here —
        both happen in the Google Admin console.
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
