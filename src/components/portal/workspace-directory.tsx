"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  setWorkspaceAccountSuspension,
  syncWorkspaceDirectory,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import {
  formatDateTime,
  Pagination,
  SearchField,
  sortRows,
  usePagination,
  useTableSort,
} from "@/components/portal/directory-table";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  CheckboxOption,
  FilterMenu,
} from "@/components/portal/members-directory";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import { Toast } from "@/components/portal/toast";

export type WorkspaceDirectoryRow = {
  accountEmail: string;
  adminUrl: string;
  avatarUrl?: string;
  displayName: string | null;
  externalId: string;
  personId: number | null;
  personName: string | null;
  suspended: boolean;
};

type SortKey = "account" | "person" | "suspended";

// "Status" already means something else in this portal — active or alumni, a
// fact about membership. Google's own state is a single flag, so it is shown
// as one rather than borrowed into a word that would then mean two things in
// the same table.
function suspendedLabel(suspended: boolean) {
  return suspended ? "Yes" : "No";
}

// Two values, so the filter is the same shape as every other one in the portal
// rather than a checkbox that reads as an on/off switch for the whole table.
const suspensionOptions = ["suspended", "active"] as const;

type SuspensionFilter = (typeof suspensionOptions)[number];

const suspensionLabels: Record<SuspensionFilter, string> = {
  active: "Not suspended",
  suspended: "Suspended",
};

function suspensionFilterLabel(selected: SuspensionFilter[]) {
  if (selected.length === suspensionOptions.length) return "Suspended: All";
  if (selected.length === 0) return "Suspended: None";
  return `Suspended: ${suspensionLabels[selected[0]]}`;
}

function sortValue(account: WorkspaceDirectoryRow, key: SortKey) {
  if (key === "person") return account.personName ?? "";
  if (key === "suspended") return suspendedLabel(account.suspended);
  return account.accountEmail;
}

function matchesSuspension(
  account: WorkspaceDirectoryRow,
  selected: SuspensionFilter[],
) {
  return selected.includes(account.suspended ? "suspended" : "active");
}

function toggleSuspension(
  selected: SuspensionFilter[],
  value: SuspensionFilter,
) {
  return selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];
}

function SuspensionFilterMenu({
  onChange,
  selected,
}: {
  onChange: (selected: SuspensionFilter[]) => void;
  selected: SuspensionFilter[];
}) {
  return (
    <FilterMenu icon="filter_alt" label={suspensionFilterLabel(selected)}>
      <fieldset>
        <legend className="section-label mb-2 opacity-45">Suspended</legend>
        {suspensionOptions.map((option) => (
          <CheckboxOption
            checked={selected.includes(option)}
            key={option}
            label={suspensionLabels[option]}
            onChange={() => onChange(toggleSuspension(selected, option))}
          />
        ))}
      </fieldset>
    </FilterMenu>
  );
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

function SuspensionButton({
  busy,
  onClick,
  suspended,
}: {
  busy: boolean;
  onClick: () => void;
  suspended: boolean;
}) {
  return (
    <button
      className={`portal-button whitespace-nowrap ${
        suspended ? "portal-button-primary" : "portal-button-danger"
      }`}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[1.1rem]">
        {suspended ? "lock_open" : "lock"}
      </span>
      {suspended ? "Activate account" : "Suspend account"}
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
          (!normalized ||
            account.accountEmail.toLocaleLowerCase("en").includes(normalized) ||
            account.displayName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      unmatchedSort.sortKey,
      unmatchedSort.sortDirection,
    );
  }, [
    accounts,
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
          (!normalized ||
            account.accountEmail.toLocaleLowerCase("en").includes(normalized) ||
            account.personName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      matchedSort.sortKey,
      matchedSort.sortDirection,
    );
  }, [
    accounts,
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
          Not in the portal
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Google accounts no portal profile claims. A new Google account who has
          not signed in yet looks the same as an account nobody has cleaned up,
          so check each one in the Admin console before acting.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <SuspensionFilterMenu
              onChange={setUnmatchedSuspension}
              selected={unmatchedSuspension}
            />
          </div>
          <SearchField
            label="Search accounts not in the portal"
            onChange={setUnmatchedQuery}
            placeholder="Search email or name"
            value={unmatchedQuery}
          />
        </div>

        {unmatched.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts with no matching person in the portal,
                whether each is suspended, and the actions available on it
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["account", "Email"],
                      ["suspended", "Suspended"],
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
                    <td className="py-3 pr-5">
                      {suspendedLabel(account.suspended)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SuspensionButton
                          busy={busy}
                          onClick={() => setPendingAccount(account)}
                          suspended={account.suspended}
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
                : "Every Workspace account belongs to somebody in the portal."}
          </p>
        )}

        <Pagination {...unmatchedPage} label="Unmatched Workspace accounts" />
      </section>

      <section aria-labelledby="workspace-matched-heading" className="mt-16">
        <h2 className="text-h2" id="workspace-matched-heading">
          Linked to a person
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Google accounts that belong to somebody in the portal.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <SuspensionFilterMenu
              onChange={setMatchedSuspension}
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
            <table className="w-full min-w-[62rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts linked to a person in the portal,
                whether each is suspended, and the actions available on it
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["person", "Name"],
                      ["suspended", "Suspended"],
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
                    <td className="py-3 pr-5">
                      {suspendedLabel(account.suspended)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SuspensionButton
                          busy={busy}
                          onClick={() => setPendingAccount(account)}
                          suspended={account.suspended}
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
                : "No Workspace account is linked to anybody in the portal."}
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
              ? `${pendingAccount.accountEmail} can sign in to Google and to this portal again, and reaches their mail and files as before.`
              : `${pendingAccount.accountEmail} is signed out of Google everywhere and cannot sign in — to Google or to this portal. Their mail and files are kept and nothing is deleted.`}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
