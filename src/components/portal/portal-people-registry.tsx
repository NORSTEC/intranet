"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  CheckboxOption,
  FilterMenu,
} from "@/components/portal/members-directory";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import { YouPill } from "@/components/portal/you-pill";
import {
  accessLevelLabels,
  personStatusLabels as statusLabels,
  type RegistryAccessLevel,
  type RegistryPersonStatus,
} from "@/lib/portal/access-labels";

export type { RegistryAccessLevel, RegistryPersonStatus };

export type RegistryPerson = {
  accessLevel: RegistryAccessLevel;
  avatarUrl?: string;
  deletedAt: string | null;
  email: string | null;
  // Portal access granted to an alumnus who belongs to no organization, and so
  // holds no membership row of their own.
  hasAlumniAccess: boolean;
  hasMembership: boolean;
  id: number;
  isDeleted: boolean;
  isPortalAdmin: boolean;
  lastSignInAt: string | null;
  name: string;
  organizations: string[];
  status: RegistryPersonStatus;
};

const accessLevelOptions: RegistryAccessLevel[] = [
  "portal_admin",
  "organization_admin",
  "member",
  "suspended",
];

const memberStatuses: RegistryPersonStatus[] = ["active", "alumni"];

type SortKey = "name" | "organizations" | "access" | "status" | "signIn";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sortValue(person: RegistryPerson, key: SortKey) {
  if (key === "name") return person.name;
  if (key === "organizations") return person.organizations.join(", ");
  if (key === "access") return accessLevelLabels[person.accessLevel];
  // An ISO timestamp sorts correctly as text, and people who have never
  // signed in belong at the far end rather than mixed into the dates.
  if (key === "signIn") return person.lastSignInAt ?? "";
  return statusLabels[person.status];
}

export function PortalPeopleRegistry({
  currentPersonId,
  emptyMessage = "No people exist in the portal yet.",
  people,
  statusOptions = memberStatuses,
}: {
  currentPersonId: number;
  emptyMessage?: string;
  people: RegistryPerson[];
  statusOptions?: RegistryPersonStatus[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] =
    useState<RegistryPersonStatus[]>(statusOptions);
  const [selectedAccessLevels, setSelectedAccessLevels] =
    useState<RegistryAccessLevel[]>(accessLevelOptions);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>(
    [],
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");

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
        // A status the filter does not offer — a portal administrator who
        // holds no membership — must stay reachable rather than fall through
        // a filter that never listed it.
        if (
          statusOptions.includes(person.status) &&
          !selectedStatuses.includes(person.status)
        ) {
          return false;
        }
        if (!selectedAccessLevels.includes(person.accessLevel)) return false;
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
          person.email?.toLocaleLowerCase("en").includes(normalizedQuery) ||
          person.organizations.some((organization) =>
            organization.toLocaleLowerCase("en").includes(normalizedQuery),
          )
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
  }, [
    people,
    query,
    selectedAccessLevels,
    selectedOrganizations,
    selectedStatuses,
    sortDirection,
    sortKey,
    statusOptions,
  ]);

  function toggleStatus(status: RegistryPersonStatus) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  function toggleAccessLevel(level: RegistryAccessLevel) {
    setSelectedAccessLevels((current) =>
      current.includes(level)
        ? current.filter((candidate) => candidate !== level)
        : [...current, level],
    );
  }

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

  function openPerson(personId: number) {
    router.push(`/admin/people/${personId}`);
  }

  const statusFilterLabel =
    selectedStatuses.length === statusOptions.length
      ? "Status: All"
      : selectedStatuses.length === 1
        ? `Status: ${statusLabels[selectedStatuses[0]]}`
        : selectedStatuses.length === 0
          ? "Status: None"
          : `Status: ${selectedStatuses.length} selected`;
  const accessFilterLabel =
    selectedAccessLevels.length === accessLevelOptions.length
      ? "Access: All"
      : selectedAccessLevels.length === 1
        ? `Access: ${accessLevelLabels[selectedAccessLevels[0]]}`
        : selectedAccessLevels.length === 0
          ? "Access: None"
          : `Access: ${selectedAccessLevels.length} selected`;
  const organizationFilterLabel =
    selectedOrganizations.length === 0
      ? "Organizations: All"
      : selectedOrganizations.length === 1
        ? `Organization: ${selectedOrganizations[0]}`
        : `Organizations: ${selectedOrganizations.length} selected`;

  return (
    <>
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

          <FilterMenu icon="shield_person" label={accessFilterLabel}>
            <fieldset>
              <legend className="section-label mb-2 opacity-45">Access</legend>
              {accessLevelOptions.map((level) => (
                <CheckboxOption
                  checked={selectedAccessLevels.includes(level)}
                  key={level}
                  label={accessLevelLabels[level]}
                  onChange={() => toggleAccessLevel(level)}
                />
              ))}
            </fieldset>
          </FilterMenu>

          {statusOptions.length > 1 && (
            <FilterMenu icon="filter_alt" label={statusFilterLabel}>
              <fieldset>
                <legend className="section-label mb-2 opacity-45">
                  Status
                </legend>
                {statusOptions.map((status) => (
                  <CheckboxOption
                    checked={selectedStatuses.includes(status)}
                    key={status}
                    label={statusLabels[status]}
                    onChange={() => toggleStatus(status)}
                  />
                ))}
              </fieldset>
            </FilterMenu>
          )}
        </div>

        <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
          <span className="sr-only">Search people</span>
          <input
            className="portal-field w-full pr-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or organization"
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
          <table className="w-full min-w-[62rem] border-collapse">
            <caption className="sr-only">
              People in the portal, with their organizations, access level,
              membership status and last sign-in
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["name", "Name"],
                    ["organizations", "Organization"],
                    ["access", "Access"],
                    ["status", "Status"],
                    ["signIn", "Last sign-in"],
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
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((person) => (
                <tr
                  aria-label={`Manage ${person.name}`}
                  className="cursor-pointer border-b border-moody transition-colors hover:bg-moody hover:text-egg focus-visible:bg-moody focus-visible:text-egg focus-visible:outline-none"
                  key={person.id}
                  onClick={() => openPerson(person.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPerson(person.id);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <td className="py-3 pl-4 pr-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <MemberAvatar name={person.name} src={person.avatarUrl} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="truncate">{person.name}</span>
                          {person.id === currentPersonId && <YouPill />}
                        </span>
                        <span className="mt-0.5 block truncate text-sm opacity-55">
                          {person.email ?? "No email registered"}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-5">
                    {person.organizations.length > 0 ? (
                      person.organizations.join(", ")
                    ) : (
                      <span aria-label="No organization">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-5">
                    {accessLevelLabels[person.accessLevel]}
                  </td>
                  <td className="py-3 pr-5">
                    {statusLabels[person.status]}
                  </td>
                  <td className="py-3 pr-4">
                    {person.lastSignInAt ? (
                      formatDate(person.lastSignInAt)
                    ) : (
                      <span className="opacity-55">Never signed in</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-sm opacity-55">
          {people.length === 0 ? emptyMessage : "No people match these filters."}
        </p>
      )}
    </>
  );
}
