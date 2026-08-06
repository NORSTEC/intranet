"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { syncSlackDirectory } from "@/app/(portal)/admin/actions";
import {
  formatDateTime,
  SearchField,
  sortRows,
  useTableSort,
} from "@/components/portal/directory-table";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  CheckboxOption,
  FilterMenu,
} from "@/components/portal/members-directory";
import { SortableTableHeader } from "@/components/portal/sortable-table-header";
import { Toast } from "@/components/portal/toast";

export type SlackDirectoryRow = {
  /** Null when Slack holds no address for the account. */
  accountEmail: string | null;
  avatarUrl?: string;
  deactivated: boolean;
  displayName: string | null;
  externalId: string;
  personId: number | null;
  personName: string | null;
  /** Null when the workspace domain could not be read, so no link is shown. */
  profileUrl: string | null;
};

type SortKey = "account" | "deactivated" | "person";

function deactivatedLabel(deactivated: boolean) {
  return deactivated ? "Yes" : "No";
}

// An account Slack holds no address for still has to say something in the
// column an administrator scans. The Slack id is the last resort and is at
// least searchable, which "Unknown" would not be.
function accountLabel(account: SlackDirectoryRow) {
  return account.accountEmail ?? account.displayName ?? account.externalId;
}

const deactivationOptions = ["deactivated", "active"] as const;

type DeactivationFilter = (typeof deactivationOptions)[number];

const deactivationLabels: Record<DeactivationFilter, string> = {
  active: "Not deactivated",
  deactivated: "Deactivated",
};

function deactivationFilterLabel(selected: DeactivationFilter[]) {
  if (selected.length === deactivationOptions.length) return "Deactivated: All";
  if (selected.length === 0) return "Deactivated: None";
  return `Deactivated: ${deactivationLabels[selected[0]]}`;
}

function toggleDeactivation(
  selected: DeactivationFilter[],
  value: DeactivationFilter,
) {
  return selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];
}

function matchesDeactivation(
  account: SlackDirectoryRow,
  selected: DeactivationFilter[],
) {
  return selected.includes(account.deactivated ? "deactivated" : "active");
}

function DeactivationFilterMenu({
  onChange,
  selected,
}: {
  onChange: (selected: DeactivationFilter[]) => void;
  selected: DeactivationFilter[];
}) {
  return (
    <FilterMenu icon="filter_alt" label={deactivationFilterLabel(selected)}>
      <fieldset>
        <legend className="section-label mb-2 opacity-45">Deactivated</legend>
        {deactivationOptions.map((option) => (
          <CheckboxOption
            checked={selected.includes(option)}
            key={option}
            label={deactivationLabels[option]}
            onChange={() => onChange(toggleDeactivation(selected, option))}
          />
        ))}
      </fieldset>
    </FilterMenu>
  );
}

function sortValue(account: SlackDirectoryRow, key: SortKey) {
  if (key === "person") return account.personName ?? "";
  if (key === "deactivated") return deactivatedLabel(account.deactivated);
  return accountLabel(account);
}

function SlackProfileLink({ href }: { href: string | null }) {
  if (!href) return null;
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
      Open in Slack
    </a>
  );
}

/**
 * The reconciliation between the Slack workspace and the portal, and — unlike
 * the Google Workspace report next to it — nothing more than that. There is no
 * deactivate button, for two separate reasons that happen to agree:
 *
 * Slack Pro has no API for deactivating a member. `admin.users.*` and SCIM are
 * Business+ and Enterprise Grid features, so a button here could only ever have
 * written a row claiming something the portal had not done.
 *
 * And the portal is not in use yet. Until it is, the Slack app holds read
 * scopes only, so no mistake in this screen — or in the code behind it — can
 * reach the workspace people actually rely on.
 *
 * Acting on a row therefore means opening it in Slack and doing it there. That
 * is the honest shape of the feature rather than a limitation to work around.
 */
export function SlackDirectory({
  accounts,
  lastSyncedAt,
  slackConfigured,
}: {
  accounts: SlackDirectoryRow[];
  lastSyncedAt: string | null;
  slackConfigured: boolean;
}) {
  const router = useRouter();
  const [unmatchedQuery, setUnmatchedQuery] = useState("");
  const [matchedQuery, setMatchedQuery] = useState("");
  const [unmatchedDeactivation, setUnmatchedDeactivation] = useState<
    DeactivationFilter[]
  >([...deactivationOptions]);
  const [matchedDeactivation, setMatchedDeactivation] = useState<
    DeactivationFilter[]
  >([...deactivationOptions]);
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
    return sortRows(
      accounts.filter(
        (account) =>
          account.personId === null &&
          matchesDeactivation(account, unmatchedDeactivation) &&
          (!normalized ||
            accountLabel(account).toLocaleLowerCase("en").includes(normalized) ||
            account.displayName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      unmatchedSort.sortKey,
      unmatchedSort.sortDirection,
      (account, key) => sortValue(account, key as SortKey),
    );
  }, [
    accounts,
    unmatchedDeactivation,
    unmatchedQuery,
    unmatchedSort.sortDirection,
    unmatchedSort.sortKey,
  ]);

  const matched = useMemo(() => {
    const normalized = matchedQuery.trim().toLocaleLowerCase("en");
    return sortRows(
      accounts.filter(
        (account) =>
          account.personId !== null &&
          matchesDeactivation(account, matchedDeactivation) &&
          (!normalized ||
            accountLabel(account).toLocaleLowerCase("en").includes(normalized) ||
            account.personName?.toLocaleLowerCase("en").includes(normalized)),
      ),
      matchedSort.sortKey,
      matchedSort.sortDirection,
      (account, key) => sortValue(account, key as SortKey),
    );
  }, [
    accounts,
    matchedDeactivation,
    matchedQuery,
    matchedSort.sortDirection,
    matchedSort.sortKey,
  ]);

  function sync() {
    startTransition(async () => {
      const result = await syncSlackDirectory();
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      router.refresh();
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
          disabled={busy || !slackConfigured}
          onClick={sync}
          type="button"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            {busy ? "progress_activity" : "cloud_sync"}
          </span>
          {busy ? "Reading the workspace…" : "Sync with Slack"}
        </button>
        <p className="text-sm opacity-55">
          {!slackConfigured
            ? "Slack is not configured on this server."
            : lastSyncedAt
              ? `Last synced ${formatDateTime(lastSyncedAt)}`
              : "Never synced"}
        </p>
      </div>

      <section aria-labelledby="slack-unmatched-heading" className="mt-14">
        <h2 className="text-h2" id="slack-unmatched-heading">
          Not in the portal
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Slack accounts no portal profile claims. Somebody whose Slack address
          differs from every address the portal knows for them lands here
          too — check who it is in Slack before treating it as abandoned.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <DeactivationFilterMenu
              onChange={setUnmatchedDeactivation}
              selected={unmatchedDeactivation}
            />
          </div>
          <SearchField
            label="Search Slack accounts not in the portal"
            onChange={setUnmatchedQuery}
            placeholder="Search email or name"
            value={unmatchedQuery}
          />
        </div>

        {unmatched.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse">
              <caption className="sr-only">
                Slack accounts with no matching person in the portal, and
                whether each is deactivated
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["account", "Account"],
                      ["deactivated", "Deactivated"],
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
                {unmatched.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <span className="block font-medium break-words">
                        {accountLabel(account)}
                      </span>
                      {account.displayName &&
                        account.displayName !== accountLabel(account) && (
                          <span className="mt-0.5 block text-sm opacity-55">
                            {account.displayName}
                          </span>
                        )}
                    </td>
                    <td className="py-3 pr-5">
                      {deactivatedLabel(account.deactivated)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SlackProfileLink href={account.profileUrl} />
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
              ? "Nothing to show until Slack has been synced."
              : accounts.some((account) => account.personId === null)
                ? "No unmatched accounts match these filters."
                : "Every Slack account belongs to somebody in the portal."}
          </p>
        )}
      </section>

      <section aria-labelledby="slack-matched-heading" className="mt-16">
        <h2 className="text-h2" id="slack-matched-heading">
          Linked to a person
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Slack accounts that belong to somebody in the portal.
        </p>

        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <DeactivationFilterMenu
              onChange={setMatchedDeactivation}
              selected={matchedDeactivation}
            />
          </div>
          <SearchField
            label="Search linked Slack accounts"
            onChange={setMatchedQuery}
            placeholder="Search name or email"
            value={matchedQuery}
          />
        </div>

        {matched.length > 0 ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse">
              <caption className="sr-only">
                Slack accounts linked to a person in the portal, and whether
                each is deactivated
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["person", "Name"],
                      ["deactivated", "Deactivated"],
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
                {matched.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          name={account.personName ?? accountLabel(account)}
                          src={account.avatarUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {account.personName ?? "Unnamed person"}
                          </span>
                          <span className="mt-0.5 block truncate text-sm opacity-55">
                            {accountLabel(account)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-5">
                      {deactivatedLabel(account.deactivated)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap justify-end gap-3">
                        <SlackProfileLink href={account.profileUrl} />
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
              ? "Nothing to show until Slack has been synced."
              : accounts.some((account) => account.personId !== null)
                ? "No linked accounts match these filters."
                : "No Slack account is linked to anybody in the portal."}
          </p>
        )}
      </section>
    </>
  );
}
