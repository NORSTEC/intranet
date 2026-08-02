"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TeamMemberCard } from "@/components/portal/team-member-card";

type DirectoryOrganization = {
  id: number;
  name: string;
  slug: string;
};

type DirectoryStatus = "active" | "alumni";
type DirectoryView = "table" | "cards";
type SortDirection = "ascending" | "descending";
type SortKey = "name" | "organizations" | "status" | "email";

export type DirectoryMember = {
  id: number;
  name: string;
  avatarUrl?: string;
  email: string | null;
  linkedinUrl: string | null;
  organizations: DirectoryOrganization[];
  phoneNumber: string | null;
  profileHref: string;
  status: DirectoryStatus;
};

function statusLabel(status: DirectoryStatus) {
  return status === "active" ? "Active" : "Alumni";
}

function CheckboxOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2 text-sm font-medium">
      <input
        checked={checked}
        className="sr-only"
        onChange={onChange}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-[0.35rem] border-2 border-moody ${checked ? "bg-moody text-egg" : "bg-transparent text-transparent"}`}
      >
        <span className="material-symbols-outlined text-[0.9rem] font-bold">
          check
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}

function FilterMenu({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: string;
  label: string;
}) {
  return (
    <details className="group relative">
      <summary className="portal-button list-none [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-[1.15rem]">{icon}</span>
        {label}
        <span className="material-symbols-outlined text-[1.05rem] transition-transform group-open:rotate-180">
          keyboard_arrow_down
        </span>
      </summary>
      <div className="portal-surface absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-60 p-4">
        {children}
      </div>
    </details>
  );
}

export function MembersDirectory({
  members,
  organizations,
}: {
  members: DirectoryMember[];
  organizations: DirectoryOrganization[];
}) {
  const router = useRouter();
  const [view, setView] = useState<DirectoryView>("table");
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<DirectoryStatus[]>([
    "active",
    "alumni",
  ]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("ascending");

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return members
      .filter((member) => {
        if (!selectedStatuses.includes(member.status)) return false;
        if (
          selectedOrganizations.length > 0 &&
          !member.organizations.some((organization) =>
            selectedOrganizations.includes(organization.id),
          )
        ) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          member.name,
          member.email ?? "",
          ...member.organizations.map((organization) => organization.name),
        ]
          .join(" ")
          .toLocaleLowerCase("en")
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (!sortKey) return 0;
        const value = (member: DirectoryMember) => {
          if (sortKey === "organizations") {
            return member.organizations
              .map((organization) => organization.name)
              .join(", ");
          }
          if (sortKey === "status") return statusLabel(member.status);
          if (sortKey === "email") return member.email ?? "";
          return member.name;
        };
        const comparison = value(left).localeCompare(value(right), "en", {
          sensitivity: "base",
        });
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [
    members,
    query,
    selectedOrganizations,
    selectedStatuses,
    sortDirection,
    sortKey,
  ]);

  function toggleStatus(status: DirectoryStatus) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  function toggleOrganization(organizationId: number) {
    setSelectedOrganizations((current) =>
      current.includes(organizationId)
        ? current.filter((candidate) => candidate !== organizationId)
        : [...current, organizationId],
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

  const statusFilterLabel =
    selectedStatuses.length === 2
      ? "Status: All"
      : selectedStatuses.length === 1
        ? `Status: ${statusLabel(selectedStatuses[0])}`
        : "Status: None";
  const organizationFilterLabel =
    selectedOrganizations.length === 0 ||
    selectedOrganizations.length === organizations.length
      ? "Organizations: All"
      : selectedOrganizations.length === 1
        ? `Organization: ${
            organizations.find(
              (organization) => organization.id === selectedOrganizations[0],
            )?.name ?? "Selected"
          }`
        : `Organizations · ${selectedOrganizations.length}`;

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterMenu icon="filter_alt" label={statusFilterLabel}>
            <fieldset>
              <legend className="section-label mb-2 opacity-45">Status</legend>
              <CheckboxOption
                checked={selectedStatuses.includes("active")}
                label="Active"
                onChange={() => toggleStatus("active")}
              />
              <CheckboxOption
                checked={selectedStatuses.includes("alumni")}
                label="Alumni"
                onChange={() => toggleStatus("alumni")}
              />
            </fieldset>
          </FilterMenu>

          <FilterMenu icon="apartment" label={organizationFilterLabel}>
            <fieldset>
              <legend className="section-label mb-2 opacity-45">
                Organizations
              </legend>
              <div className="max-h-72 overflow-y-auto pr-2">
                {organizations.map((organization) => (
                  <CheckboxOption
                    checked={selectedOrganizations.includes(organization.id)}
                    key={organization.id}
                    label={organization.name}
                    onChange={() => toggleOrganization(organization.id)}
                  />
                ))}
              </div>
            </fieldset>
          </FilterMenu>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
          <label className="relative min-w-0 flex-1 xl:w-72">
            <span className="sr-only">Search members</span>
            <input
              className="portal-field w-full pr-10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members"
              type="text"
              value={query}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
              search
            </span>
          </label>

          <div
            aria-label="Member view"
            className="grid min-h-11 shrink-0 grid-cols-2 rounded-full bg-moody p-1"
            role="group"
          >
            {([
              ["table", "table_rows", "Table"],
              ["cards", "grid_view", "Cards"],
            ] as const).map(([value, icon, label]) => (
              <button
                aria-pressed={view === value}
                className={`flex min-w-24 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${view === value ? "bg-egg text-moody" : "text-egg hover:text-copper"}`}
                key={value}
                onClick={() => setView(value)}
                type="button"
              >
                <span className="material-symbols-outlined text-[1.1rem]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredMembers.length > 0 ? (
        view === "table" ? (
          <div className="mt-8 overflow-x-auto">
            <table className="min-w-[46rem] w-full border-collapse">
              <thead>
                <tr>
                  {(
                    [
                      ["name", "Name"],
                      ["organizations", "Organizations"],
                      ["status", "Status"],
                      ["email", "Email"],
                    ] as const
                  ).map(([key, heading]) => (
                    <th
                      aria-sort={sortKey === key ? sortDirection : "none"}
                      className="pb-3 pr-5 text-left font-semibold italic first:pl-4 last:pr-4"
                      key={key}
                      scope="col"
                    >
                      <button
                        className="inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-copper"
                        onClick={() => changeSort(key)}
                        type="button"
                      >
                        {heading}
                        <span
                          className={`material-symbols-outlined text-[1rem] not-italic transition-transform ${
                            sortKey === key
                              ? sortDirection === "descending"
                                ? "rotate-180 opacity-100"
                                : "opacity-100"
                              : "opacity-30"
                          }`}
                        >
                          {sortKey === key ? "arrow_upward" : "unfold_more"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    aria-label={`View ${member.name}`}
                    className="cursor-pointer border-b border-moody transition-colors hover:bg-moody hover:text-egg focus-visible:bg-moody focus-visible:text-egg focus-visible:outline-none"
                    key={member.id}
                    onClick={() => router.push(member.profileHref)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(member.profileHref);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                  >
                    <td className="py-3 pl-4 pr-5 font-medium">
                      {member.name}
                    </td>
                    <td className="py-3 pr-5">
                      {member.organizations
                        .map((organization) => organization.name)
                        .join(", ")}
                    </td>
                    <td className="py-3 pr-5">{statusLabel(member.status)}</td>
                    <td className="py-3">
                      {member.email ? member.email : (
                        <span aria-label="No email address">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredMembers.map((member) => (
              <TeamMemberCard
                avatarUrl={member.avatarUrl}
                badges={member.organizations.map(
                  (organization) => organization.name,
                )}
                compact
                email={member.email ?? undefined}
                href={member.profileHref}
                key={member.id}
                linkedinUrl={member.linkedinUrl}
                name={member.name}
                phoneNumber={member.phoneNumber}
                roleTitle={null}
              />
            ))}
          </section>
        )
      ) : (
        <p className="mt-8 text-sm opacity-55">No members match these filters.</p>
      )}
    </>
  );
}
