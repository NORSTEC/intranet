"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { syncSlackDirectory } from "@/app/(portal)/admin/actions";
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
import { SortableTableHeader } from "@/components/portal/sortable-table-header";
import { Toast } from "@/components/portal/toast";

export type SlackDirectoryRow = {
  /** Null when Slack holds no address for the account. */
  accountEmail: string | null;
  avatarUrl?: string;
  deactivated: boolean;
  displayName: string | null;
  externalId: string;
  guestType: "multi_channel" | "single_channel" | null;
  handle: string | null;
  personId: number | null;
  personName: string | null;
  /** Null when the workspace domain could not be read, so no link is shown. */
  profileUrl: string | null;
  workspaceRole: "admin" | "member" | "owner";
};

type SortKey = "account" | "person" | "role" | "slackStatus";

// The word is Slack's, not the portal's. "Suspended" already means portal
// access in this codebase, and the two are unrelated: a deactivated Slack
// account says nothing about whether somebody can sign in here.
function slackStatusLabel(account: SlackDirectoryRow) {
  return account.deactivated ? "Deactivated" : "Active";
}

const guestLabels: Record<
  NonNullable<SlackDirectoryRow["guestType"]>,
  string
> = {
  multi_channel: "Multi-channel guest",
  single_channel: "Single-channel guest",
};

// Ordered so the accounts worth a second look sort together rather than
// alphabetically, which would put "Admin" above "Member" and "Owner" below it.
const roleRank: Record<SlackDirectoryRow["workspaceRole"], string> = {
  admin: "1",
  member: "3",
  owner: "0",
};

function roleLabel(account: SlackDirectoryRow) {
  if (account.workspaceRole === "owner") return "Owner";
  if (account.workspaceRole === "admin") return "Workspace admin";
  return account.guestType ? guestLabels[account.guestType] : "Member";
}

/**
 * The real name and the @handle, whichever of them is not already the headline.
 * People refer to each other by handle in Slack and by name everywhere else, so
 * a row that shows only one of the two is hard to match against either.
 */
function SecondaryLine({ account }: { account: SlackDirectoryRow }) {
  const headline = accountLabel(account);
  const parts = [
    account.displayName === headline ? null : account.displayName,
    account.handle && `@${account.handle}` !== headline
      ? `@${account.handle}`
      : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;

  return (
    <span className="mt-0.5 block text-sm opacity-55">{parts.join(" · ")}</span>
  );
}

function Badge({ tone, children }: { tone: "guest" | "role"; children: string }) {
  return (
    <span
      className={`portal-pill text-xs ${
        tone === "role" ? "portal-pill-filled" : ""
      }`}
    >
      {children}
    </span>
  );
}

// Only the facts that change how a row should be read. A plain member with no
// guest status gets nothing, so the badges stay rare enough to mean something.
function AccountBadges({ account }: { account: SlackDirectoryRow }) {
  const role =
    account.workspaceRole === "owner"
      ? "Owner"
      : account.workspaceRole === "admin"
        ? "Workspace admin"
        : null;

  if (!role && !account.guestType) return null;

  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {role && <Badge tone="role">{role}</Badge>}
      {account.guestType && (
        <Badge tone="guest">{guestLabels[account.guestType]}</Badge>
      )}
    </span>
  );
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
  active: "Active",
  deactivated: "Deactivated",
};

function deactivationFilterLabel(selected: DeactivationFilter[]) {
  if (selected.length === deactivationOptions.length) return "In Slack: All";
  if (selected.length === 0) return "In Slack: None";
  return `In Slack: ${deactivationLabels[selected[0]]}`;
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
        <legend className="section-label mb-2 opacity-45">In Slack</legend>
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
  if (key === "role") return roleRank[account.workspaceRole] + roleLabel(account);
  if (key === "slackStatus") return slackStatusLabel(account);
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
            account.handle?.toLocaleLowerCase("en").includes(normalized) ||
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
            account.handle?.toLocaleLowerCase("en").includes(normalized) ||
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

  const unmatchedPage = usePagination(unmatched);
  const matchedPage = usePagination(matched);

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
          Slack accounts no portal profile claims. Most are members whose Slack
          address the portal does not know yet, not accounts to clean up —
          matching is by address, so somebody signed in to Slack with a personal
          or organization address they never added to their profile lands here.
          Check who it is in Slack before treating it as abandoned.
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
            <table className="w-full min-w-[58rem] border-collapse">
              <caption className="sr-only">
                Slack accounts with no matching person in the portal, what each
                account is in the workspace, and whether it is still active
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["account", "Account"],
                      ["role", "In the workspace"],
                      ["slackStatus", "Slack account"],
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
                        {accountLabel(account)}
                      </span>
                      <SecondaryLine account={account} />
                      <AccountBadges account={account} />
                    </td>
                    <td className="py-3 pr-5">{roleLabel(account)}</td>
                    <td className="py-3 pr-5">{slackStatusLabel(account)}</td>
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

        <Pagination {...unmatchedPage} label="Unmatched Slack accounts" />
      </section>

      <section aria-labelledby="slack-matched-heading" className="mt-16">
        <h2 className="text-h2" id="slack-matched-heading">
          Linked to a person
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Slack accounts that belong to somebody in the portal. Deactivated is
          Slack&rsquo;s own state and says nothing about portal access — the two
          are set separately, and the portal cannot change this one.
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
            <table className="w-full min-w-[62rem] border-collapse">
              <caption className="sr-only">
                Slack accounts linked to a person in the portal, what each
                account is in the workspace, and whether it is still active
              </caption>
              <thead>
                <tr>
                  {(
                    [
                      ["person", "Name"],
                      ["role", "In the workspace"],
                      ["slackStatus", "Slack account"],
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
                          <AccountBadges account={account} />
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-5">{roleLabel(account)}</td>
                    <td className="py-3 pr-5">{slackStatusLabel(account)}</td>
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

        <Pagination {...matchedPage} label="Linked Slack accounts" />
      </section>
    </>
  );
}
