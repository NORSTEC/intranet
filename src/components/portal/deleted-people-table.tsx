"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  purgePerson,
  restorePerson,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
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

export type DeletedPerson = {
  avatarUrl?: string;
  deletedAt: string;
  email: string | null;
  id: number;
  name: string;
  organizations: string[];
};

type SortKey = "name" | "email" | "deleted" | "erasure";

const RETENTION_DAYS = 30;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function erasureMoment(deletedAt: string) {
  const erasesOn = new Date(deletedAt);
  erasesOn.setDate(erasesOn.getDate() + RETENTION_DAYS);
  return erasesOn;
}

// What is left of the retention window, which is the thing a portal
// administrator is actually deciding against.
function erasureLabel(deletedAt: string) {
  const erasesOn = erasureMoment(deletedAt);
  const daysLeft = Math.ceil(
    (erasesOn.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );

  if (daysLeft <= 0) return "In the next purge";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}

function sortValue(person: DeletedPerson, key: SortKey) {
  if (key === "name") return person.name;
  if (key === "email") return person.email ?? "";
  // Both dates derive from the same instant, so one ISO string orders both.
  return person.deletedAt;
}

type PendingAction = { kind: "restore" | "purge"; person: DeletedPerson };

export function DeletedPeopleTable({ people }: { people: DeletedPerson[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>(
    [],
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  const organizationOptions = useMemo(
    () =>
      [...new Set(people.flatMap((person) => person.organizations))].sort(
        (left, right) => left.localeCompare(right, "en"),
      ),
    [people],
  );

  const visiblePeople = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return people
      .filter((person) => {
        if (
          selectedOrganizations.length > 0 &&
          !person.organizations.some((organization) =>
            selectedOrganizations.includes(organization),
          )
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        return (
          person.name.toLocaleLowerCase("en").includes(normalizedQuery) ||
          person.email?.toLocaleLowerCase("en").includes(normalizedQuery)
        );
      })
      .sort((left, right) => {
        if (!sortKey) return 0;
        const comparison = sortValue(left, sortKey).localeCompare(
          sortValue(right, sortKey),
          "en",
          { sensitivity: "base" },
        );
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [people, query, selectedOrganizations, sortDirection, sortKey]);

  function toggleOrganization(organization: string) {
    setSelectedOrganizations((current) =>
      current.includes(organization)
        ? current.filter((candidate) => candidate !== organization)
        : [...current, organization],
    );
  }

  function changeSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      if (sortDirection === "descending") {
        setSortKey(null);
        setSortDirection("ascending");
        return;
      }
      setSortDirection((current) =>
        current === "ascending" ? "descending" : "ascending",
      );
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection("ascending");
  }

  function run(action: () => Promise<PortalManagementResult>) {
    startTransition(async () => {
      const result = await action();
      setPendingAction(null);
      setPurgeConfirmation("");
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    const { kind, person } = pendingAction;
    if (kind === "restore") {
      run(() => restorePerson({ personId: person.id }));
      return;
    }
    run(() => purgePerson({ deletedAt: person.deletedAt, personId: person.id }));
  }

  const organizationFilterLabel =
    selectedOrganizations.length === 0
      ? "Organizations: All"
      : selectedOrganizations.length === 1
        ? `Organization: ${selectedOrganizations[0]}`
        : `Organizations: ${selectedOrganizations.length} selected`;

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {organizationOptions.length > 0 && (
            <FilterMenu icon="apartment" label={organizationFilterLabel}>
              <fieldset>
                <legend className="section-label mb-2 opacity-45">
                  Organizations
                </legend>
                <div className="max-h-72 overflow-y-auto pr-2">
                  {organizationOptions.map((organization) => (
                    <CheckboxOption
                      checked={selectedOrganizations.includes(organization)}
                      key={organization}
                      label={organization}
                      onChange={() => toggleOrganization(organization)}
                    />
                  ))}
                </div>
              </fieldset>
            </FilterMenu>
          )}
        </div>

        <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
          <span className="sr-only">Search deleted users</span>
          <input
            className="portal-field w-full pr-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email"
            type="search"
            value={query}
          />
          <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
            search
          </span>
        </label>
      </div>

      {visiblePeople.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse">
            <caption className="sr-only">
              Deleted users, with the date they were deleted and how long is
              left before their data is erased permanently
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["name", "Name"],
                    ["email", "Email"],
                    ["deleted", "Deleted"],
                    ["erasure", "Erased in"],
                  ] as const
                ).map(([key, heading]) => (
                  <SortableTableHeader
                    active={sortKey === key}
                    direction={sortDirection}
                    key={key}
                    onSort={() => changeSort(key)}
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
              {visiblePeople.map((person) => (
                <tr className="border-b border-moody" key={person.id}>
                  <td className="py-3 pl-4 pr-5">
                    <div className="flex min-w-0 items-center gap-3 font-medium">
                      <MemberAvatar name={person.name} src={person.avatarUrl} />
                      <span className="truncate">{person.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-5">
                    {person.email ?? (
                      <span aria-label="No email registered">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-5">{formatDate(person.deletedAt)}</td>
                  <td className="py-3 pr-5">{erasureLabel(person.deletedAt)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        className="portal-button whitespace-nowrap"
                        disabled={busy}
                        onClick={() =>
                          setPendingAction({ kind: "restore", person })
                        }
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          restore_from_trash
                        </span>
                        Restore
                      </button>
                      <button
                        className="portal-button portal-button-danger whitespace-nowrap"
                        disabled={busy}
                        onClick={() =>
                          setPendingAction({ kind: "purge", person })
                        }
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          delete_forever
                        </span>
                        Delete permanently
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
          {people.length === 0
            ? "No one has been deleted."
            : "No deleted users match these filters."}
        </p>
      )}

      {pendingAction?.kind === "restore" && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="restore_from_trash"
          confirmLabel="Restore"
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
          title="Restore this person?"
        >
          <p>
            {pendingAction.person.name} becomes visible again with the portal
            access they had before the deletion. Memberships that ended with the
            deletion stay ended; an organization administrator has to reactivate
            them.
          </p>
        </ConfirmDialog>
      )}

      {pendingAction?.kind === "purge" && (
        <ConfirmDialog
          busy={busy}
          confirmDisabled={
            purgeConfirmation.trim().toLocaleLowerCase("en") !==
            pendingAction.person.name.toLocaleLowerCase("en")
          }
          confirmIcon="delete_forever"
          confirmLabel="Delete permanently"
          danger
          onCancel={() => {
            setPendingAction(null);
            setPurgeConfirmation("");
          }}
          onConfirm={confirmPendingAction}
          title="Delete this person permanently?"
        >
          <p>
            This deletes {pendingAction.person.name}&apos;s profile, email
            addresses, sign-in accounts, memberships, team roles, and profile
            picture. It cannot be undone.
          </p>
          <p className="mt-3">
            Audit events are kept as a record of administrative decisions, with
            every reference to this person removed.
          </p>
          <label className="mt-5 block">
            <span className="section-label mb-2 block opacity-50">
              Type &quot;{pendingAction.person.name}&quot; to confirm
            </span>
            <input
              className="portal-field"
              onChange={(event) => setPurgeConfirmation(event.target.value)}
              type="text"
              value={purgeConfirmation}
            />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
