"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  setWorkspaceAccountSuspension,
  syncWorkspaceDirectory,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  CheckboxFilterMenu,
  formatDateTime,
  Pagination,
  SearchField,
  sortRows,
  usePagination,
  useTableSort,
} from "@/components/portal/directory-table";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import { Toast } from "@/components/portal/toast";

export type WorkspaceDirectoryRow = {
  accountEmail: string;
  adminRole: "delegated_admin" | "member" | "super_admin";
  adminUrl: string;
  avatarUrl?: string;
  displayName: string | null;
  externalId: string;
  /** ISO timestamp, or null for an account nobody has ever signed in to. */
  lastLoginAt: string | null;
  personId: number | null;
  personName: string | null;
  suspended: boolean;
};

type SortKey = "account" | "accountType" | "person" | "suspended";

// Google's own words, ordered by how much a row deserves a second look. A
// super administrator is also flagged as a delegated one, so the stronger
// answer has to win — see the parser in `lib/google/workspace.ts`.
const adminRoleOptions = ["super_admin", "delegated_admin", "member"] as const;

type AdminRole = (typeof adminRoleOptions)[number];

const adminRoleLabels: Record<AdminRole, string> = {
  delegated_admin: "Delegated admin",
  member: "Member",
  super_admin: "Super admin",
};

function adminRoleLabel(account: WorkspaceDirectoryRow) {
  return adminRoleLabels[account.adminRole];
}

/**
 * The fact the unmatched table was missing. An account nobody has signed in to
 * for years is the one worth cleaning up; an account nobody signs in *as* but
 * something depends on — `web@norstec.no` runs this portal's own deployments —
 * has a recent sign-in, and that is the signal telling the two apart. It used
 * to require opening the Admin console in another tab.
 */
function lastSignInLabel(account: WorkspaceDirectoryRow) {
  if (!account.lastLoginAt) return "Never";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(account.lastLoginAt));
}

// Google's own words, and the same column the Slack report calls Account
// status — one shape for both providers, so an administrator reading the two
// screens is answering the same question twice rather than two questions.
// Plain "Status" is still avoided: on its own it means membership in this
// portal, which is a different fact entirely.
function suspendedLabel(suspended: boolean) {
  return suspended ? "Suspended" : "Active";
}

const suspensionOptions = ["active", "suspended"] as const;

type SuspensionFilter = (typeof suspensionOptions)[number];

const suspensionLabels: Record<SuspensionFilter, string> = {
  active: "Active",
  suspended: "Suspended",
};

function sortValue(account: WorkspaceDirectoryRow, key: SortKey) {
  if (key === "person") return account.personName ?? "";
  if (key === "suspended") return suspendedLabel(account.suspended);
  if (key === "accountType") {
    return String(adminRoleOptions.indexOf(account.adminRole));
  }
  return account.accountEmail;
}

function matchesSuspension(
  account: WorkspaceDirectoryRow,
  selected: SuspensionFilter[],
) {
  return selected.includes(account.suspended ? "suspended" : "active");
}

function matchesAdminRole(
  account: WorkspaceDirectoryRow,
  selected: AdminRole[],
) {
  return selected.includes(account.adminRole);
}

function sortAccounts(
  accounts: WorkspaceDirectoryRow[],
  sortKey: SortKey | null,
  sortDirection: TableSortDirection,
) {
  return sortRows(accounts, sortKey, sortDirection, (account, key) =>
    sortValue(account, key as SortKey),
  );
}

/**
 * A super administrator cannot be changed from here at all. The portal's
 * service account holds a delegated role, and Google refuses a delegated role
 * any change to a super administrator — suspending one and reactivating one
 * alike. So the button is disabled in both directions rather than left to fail,
 * and it says why on hover instead of after the click. The server action
 * refuses the same thing, because a disabled button is a hint and not a guard.
 */
function SuspensionButton({
  account,
  busy,
  onClick,
}: {
  account: WorkspaceDirectoryRow;
  busy: boolean;
  onClick: () => void;
}) {
  const blocked = account.adminRole === "super_admin";

  return (
    <button
      className={`portal-button whitespace-nowrap ${
        account.suspended ? "portal-button-primary" : "portal-button-danger"
      }`}
      disabled={busy || blocked}
      onClick={onClick}
      title={
        blocked
          ? "A Google super administrator cannot be changed from the intranet. Do it in the Admin console."
          : undefined
      }
      type="button"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[1.1rem]">
        {account.suspended ? "lock_open" : "lock"}
      </span>
      {account.suspended ? "Activate account" : "Suspend account"}
    </button>
  );
}

function AdminConsoleLink({ href }: { href: string }) {
  return (
    <a
      className="portal-button whitespace-nowrap"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[1.1rem]">
        open_in_new
      </span>
      Open in Admin console
    </a>
  );
}

/**
 * The reconciliation between the norstec.no directory and the portal. Its point
 * is the first table: accounts nobody in the portal owns. Some are people who
 * have simply never signed in, and some are accounts left behind by somebody
 * who left years ago — the portal cannot tell those apart and does not pretend
 * to. It shows them, and both decisions available on one are one click away.
 *
 * Syncing is a button rather than a schedule on purpose. A scheduled job has no
 * signed-in user, so it would need a privileged database key kept on the
 * server; this portal deliberately holds none, and every read here goes through
 * row level security with the administrator's own session.
 */
export function WorkspaceDirectory({
  accounts,
  lastSyncedAt,
  workspaceConfigured,
}: {
  accounts: WorkspaceDirectoryRow[];
  lastSyncedAt: string | null;
  workspaceConfigured: boolean;
}) {
  const router = useRouter();
  const [unmatchedQuery, setUnmatchedQuery] = useState("");
  const [matchedQuery, setMatchedQuery] = useState("");
  const [unmatchedSuspension, setUnmatchedSuspension] =
    useState<SuspensionFilter[]>([...suspensionOptions]);
  const [matchedSuspension, setMatchedSuspension] =
    useState<SuspensionFilter[]>([...suspensionOptions]);
  const [unmatchedAdminRoles, setUnmatchedAdminRoles] = useState<AdminRole[]>([
    ...adminRoleOptions,
  ]);
  const [matchedAdminRoles, setMatchedAdminRoles] = useState<AdminRole[]>([
    ...adminRoleOptions,
  ]);
  const [pendingAccount, setPendingAccount] =
    useState<WorkspaceDirectoryRow | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  const { changeSort: changeUnmatchedSort, ...unmatchedSort } =
    useTableSort<SortKey>();
  const { changeSort: changeMatchedSort, ...matchedSort } =
    useTableSort<SortKey>();

  const unmatched = useMemo(() => {
    const normalized = unmatchedQuery.trim().toLocaleLowerCase("en");
    return sortAccounts(
      accounts.filter(
        (account) =>
          account.personId === null &&
          matchesSuspension(account, unmatchedSuspension) &&
          matchesAdminRole(account, unmatchedAdminRoles) &&
          (!normalized ||
            account.accountEmail.toLocaleLowerCase("en").includes(normalized) ||
            account.displayName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      unmatchedSort.sortKey,
      unmatchedSort.sortDirection,
    );
  }, [
    accounts,
    unmatchedAdminRoles,
    unmatchedQuery,
    unmatchedSort.sortDirection,
    unmatchedSort.sortKey,
    unmatchedSuspension,
  ]);

  const matched = useMemo(() => {
    const normalized = matchedQuery.trim().toLocaleLowerCase("en");
    return sortAccounts(
      accounts.filter(
        (account) =>
          account.personId !== null &&
          matchesSuspension(account, matchedSuspension) &&
          matchesAdminRole(account, matchedAdminRoles) &&
          (!normalized ||
            account.accountEmail.toLocaleLowerCase("en").includes(normalized) ||
            account.personName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      matchedSort.sortKey,
      matchedSort.sortDirection,
    );
  }, [
    accounts,
    matchedAdminRoles,
    matchedQuery,
    matchedSort.sortDirection,
    matchedSort.sortKey,
    matchedSuspension,
  ]);

  const unmatchedPage = usePagination(unmatched);
  const matchedPage = usePagination(matched);

  function sync() {
    startTransition(async () => {
      const result = await syncWorkspaceDirectory();
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      router.refresh();
    });
  }

  function confirmSuspension() {
    if (!pendingAccount) return;
    const account = pendingAccount;
    startTransition(async () => {
      const result = await setWorkspaceAccountSuspension({
        externalId: account.externalId,
        suspended: !account.suspended,
      });
      setPendingAccount(null);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          className="portal-button"
          disabled={busy || !workspaceConfigured}
          onClick={sync}
          type="button"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            {busy ? "progress_activity" : "cloud_sync"}
          </span>
          {busy ? "Reading the directory…" : "Sync with Google"}
        </button>
        <p className="text-sm opacity-55">
          {!workspaceConfigured
            ? "Google Workspace is not configured on this server."
            : lastSyncedAt
              ? `Last synced ${formatDateTime(lastSyncedAt)}`
              : "Never synced"}
        </p>
      </div>

      <section aria-labelledby="workspace-unmatched-heading" className="mt-14">
        <h2 className="text-h2" id="workspace-unmatched-heading">
          Not in the intranet
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Google accounts no intranet profile claims. A new Google account who has
          not signed in yet looks the same as an account nobody has cleaned up,
          so check each one in the Admin console before acting.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <CheckboxFilterMenu
              icon="badge"
              labels={adminRoleLabels}
              legend="Account type"
              name="Account type"
              onChange={setUnmatchedAdminRoles}
              options={adminRoleOptions}
              selected={unmatchedAdminRoles}
            />
            <CheckboxFilterMenu
              icon="filter_alt"
              labels={suspensionLabels}
              legend="Account status"
              name="Account status"
              onChange={setUnmatchedSuspension}
              options={suspensionOptions}
              selected={unmatchedSuspension}
            />
          </div>
          <SearchField
            label="Search accounts not in the intranet"
            onChange={setUnmatchedQuery}
            placeholder="Search email or name"
            value={unmatchedQuery}
          />
        </div>

        {unmatched.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[64rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts with no matching person in the intranet,
                what each account is in Google, its status, and the actions available on it
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["account", "Email"],
                      ["accountType", "Account type"],
                      ["suspended", "Account status"],
                    ] as const
                  ).map(([key, heading]) => (
                    <SortableTableHeader
                      active={unmatchedSort.sortKey === key}
                      direction={unmatchedSort.sortDirection}
                      key={key}
                      onSort={() => changeUnmatchedSort(key)}
                    >
                      {heading}
                    </SortableTableHeader>
                  ))}
                  <th
                    className="pb-3 pr-4 text-right font-semibold italic"
                    scope="col"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {unmatchedPage.pageRows.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <span className="block font-medium break-words">
                        {account.accountEmail}
                      </span>
                      {account.displayName && (
                        <span className="mt-0.5 block text-sm opacity-55">
                          {account.displayName}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-5">{adminRoleLabel(account)}</td>
                    <td className="py-3 pr-5">
                      {suspendedLabel(account.suspended)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SuspensionButton
                          account={account}
                          busy={busy}
                          onClick={() => setPendingAccount(account)}
                        />
                        <AdminConsoleLink href={account.adminUrl} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-8 text-sm opacity-55">
            {!lastSyncedAt
              ? "Nothing to show until the directory has been synced."
              : accounts.some((account) => account.personId === null)
                ? "No unmatched accounts match these filters."
                : "Every Workspace account belongs to somebody in the intranet."}
          </p>
        )}

        <Pagination {...unmatchedPage} label="Unmatched Workspace accounts" />
      </section>

      <section aria-labelledby="workspace-matched-heading" className="mt-16">
        <h2 className="text-h2" id="workspace-matched-heading">
          Linked to a person
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Google accounts that belong to somebody in the intranet.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <CheckboxFilterMenu
              icon="badge"
              labels={adminRoleLabels}
              legend="Account type"
              name="Account type"
              onChange={setMatchedAdminRoles}
              options={adminRoleOptions}
              selected={matchedAdminRoles}
            />
            <CheckboxFilterMenu
              icon="filter_alt"
              labels={suspensionLabels}
              legend="Account status"
              name="Account status"
              onChange={setMatchedSuspension}
              options={suspensionOptions}
              selected={matchedSuspension}
            />
          </div>
          <SearchField
            label="Search linked accounts"
            onChange={setMatchedQuery}
            placeholder="Search name or email"
            value={matchedQuery}
          />
        </div>

        {matched.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[68rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts linked to a person in the intranet,
                what each account is in Google, its status, and the actions available on it
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["person", "Name"],
                      ["accountType", "Account type"],
                      ["suspended", "Account status"],
                    ] as const
                  ).map(([key, heading]) => (
                    <SortableTableHeader
                      active={matchedSort.sortKey === key}
                      direction={matchedSort.sortDirection}
                      key={key}
                      onSort={() => changeMatchedSort(key)}
                    >
                      {heading}
                    </SortableTableHeader>
                  ))}
                  <th
                    className="pb-3 pr-4 text-right font-semibold italic"
                    scope="col"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {matchedPage.pageRows.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          name={account.personName ?? account.accountEmail}
                          src={account.avatarUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {account.personName ?? "Unnamed person"}
                          </span>
                          <span className="mt-0.5 block truncate text-sm opacity-55">
                            {account.accountEmail}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-5">{adminRoleLabel(account)}</td>
                    <td className="py-3 pr-5">
                      {suspendedLabel(account.suspended)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SuspensionButton
                          account={account}
                          busy={busy}
                          onClick={() => setPendingAccount(account)}
                        />
                        <AdminConsoleLink href={account.adminUrl} />
                        <button
                          className="portal-button whitespace-nowrap"
                          onClick={() =>
                            router.push(`/admin/people/${account.personId}`)
                          }
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-[1.1rem]"
                          >
                            person
                          </span>
                          See profile
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-8 text-sm opacity-55">
            {!lastSyncedAt
              ? "Nothing to show until the directory has been synced."
              : accounts.some((account) => account.personId !== null)
                ? "No linked accounts match these filters."
                : "No Workspace account is linked to anybody in the intranet."}
          </p>
        )}

        <Pagination {...matchedPage} label="Linked Workspace accounts" />
      </section>

      {pendingAccount && (
        <ConfirmDialog
          busy={busy}
          confirmIcon={pendingAccount.suspended ? "lock_open" : "lock"}
          confirmLabel={pendingAccount.suspended ? "Activate" : "Suspend"}
          danger={!pendingAccount.suspended}
          onCancel={() => setPendingAccount(null)}
          onConfirm={confirmSuspension}
          title={
            pendingAccount.suspended
              ? "Activate this Workspace account?"
              : "Suspend this Workspace account?"
          }
        >
          <p>
            {pendingAccount.suspended
              ? `${pendingAccount.accountEmail} can sign in to Google and to this intranet again, and reaches their mail and files as before.`
              : `${pendingAccount.accountEmail} is signed out of Google everywhere and cannot sign in — to Google or to this intranet. Their mail and files are kept and nothing is deleted.`}
          </p>
          {/* Suspending an administrator takes the Admin console away from
              whoever was using it, which is not obvious from an address. Said
              here rather than in the table, because this is the moment it
              changes what somebody should do. */}
          {!pendingAccount.suspended &&
            pendingAccount.adminRole === "delegated_admin" && (
              <p className="mt-3 font-medium">
                This account holds a delegated administrator role in Google.
                Suspending it removes whatever that role was being used for.
              </p>
            )}
          {/* "Never" is the strongest signal of the three, so suppressing it
              when the timestamp is null threw away the reason this is here.
              An account nobody has ever signed in to is either abandoned or
              brand new, and both are worth pausing over. */}
          {!pendingAccount.suspended && (
            <p className="mt-3 opacity-65">
              {pendingAccount.lastLoginAt
                ? `Last signed in ${lastSignInLabel(pendingAccount)}.`
                : "Nobody has ever signed in to this account."}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
