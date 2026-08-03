"use client";

import { useMemo, useState } from "react";
import { CheckboxOption, FilterMenu } from "@/components/portal/members-directory";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import { useTeamEdit } from "@/components/portal/team-edit-form";

export type TeamOrganizationMember = {
  avatarUrl?: string;
  isFormerMember: boolean;
  name: string;
  personId: number;
};

type SortKey = "name" | "status";
type StatusFilter = "active" | "ended";

function statusLabel(isFormerMember: boolean) {
  return isFormerMember ? "Former member" : "Active";
}

function sortMembers(
  members: TeamOrganizationMember[],
  sortKey: SortKey | null,
  sortDirection: TableSortDirection,
) {
  if (!sortKey) return members;
  return [...members].sort((left, right) => {
    const leftValue = sortKey === "name" ? left.name : statusLabel(left.isFormerMember);
    const rightValue = sortKey === "name" ? right.name : statusLabel(right.isFormerMember);
    const comparison = leftValue.localeCompare(rightValue, "en", { sensitivity: "base" });
    return sortDirection === "ascending" ? comparison : -comparison;
  });
}

function MemberRow({
  actionIcon,
  actionLabel,
  member,
  onAction,
}: {
  actionIcon: string;
  actionLabel: string;
  member: TeamOrganizationMember;
  onAction: () => void;
}) {
  return (
    <tr className="border-b border-moody">
      <td className="py-3 pl-4 pr-5">
        <div className="flex min-w-0 items-center gap-3 font-medium">
          <MemberAvatar name={member.name} src={member.avatarUrl} />
          <span className="min-w-0 truncate">{member.name}</span>
        </div>
      </td>
      <td className="py-3 pr-5">{statusLabel(member.isFormerMember)}</td>
      <td className="py-3 pr-4">
        <div className="flex justify-end">
          <button
            className="portal-button whitespace-nowrap"
            onClick={onAction}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              {actionIcon}
            </span>
            {actionLabel}
          </button>
        </div>
      </td>
    </tr>
  );
}

function MemberTable({
  actionIcon,
  actionLabel,
  emptyMessage,
  members,
  onAction,
  sortDirection,
  sortKey,
  onSort,
}: {
  actionIcon: string;
  actionLabel: string;
  emptyMessage: string;
  members: TeamOrganizationMember[];
  onAction: (personId: number) => void;
  onSort: (key: SortKey) => void;
  sortDirection: TableSortDirection;
  sortKey: SortKey | null;
}) {
  if (members.length === 0) {
    return <p className="mt-5 text-sm opacity-55">{emptyMessage}</p>;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[36rem] w-full border-collapse">
        <thead>
          <tr>
            <SortableTableHeader
              active={sortKey === "name"}
              direction={sortDirection}
              onSort={() => onSort("name")}
            >
              Name
            </SortableTableHeader>
            <SortableTableHeader
              active={sortKey === "status"}
              direction={sortDirection}
              onSort={() => onSort("status")}
            >
              Status
            </SortableTableHeader>
            <th className="pb-3 pr-4 text-right font-semibold italic" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <MemberRow
              actionIcon={actionIcon}
              actionLabel={actionLabel}
              key={member.personId}
              member={member}
              onAction={() => onAction(member.personId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamMembersEditor({
  initialMemberIds,
  members,
}: {
  initialMemberIds: number[];
  members: TeamOrganizationMember[];
}) {
  const { markDirty, resetSignal } = useTeamEdit();
  const [memberIds, setMemberIds] = useState(() => new Set(initialMemberIds));
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter[]>([
    "active",
    "ended",
  ]);
  const [teamSortKey, setTeamSortKey] = useState<SortKey | null>(null);
  const [teamSortDirection, setTeamSortDirection] =
    useState<TableSortDirection>("ascending");
  const [candidateSortKey, setCandidateSortKey] = useState<SortKey | null>(null);
  const [candidateSortDirection, setCandidateSortDirection] =
    useState<TableSortDirection>("ascending");

  // Resetting state during render (rather than in an effect) on a changed
  // resetSignal avoids an extra commit; see https://react.dev/learn/you-might-not-need-an-effect
  const [appliedResetSignal, setAppliedResetSignal] = useState(resetSignal);
  if (resetSignal !== appliedResetSignal) {
    setAppliedResetSignal(resetSignal);
    setMemberIds(new Set(initialMemberIds));
    setQuery("");
    setSelectedStatuses(["active", "ended"]);
  }

  function addMember(personId: number) {
    setMemberIds((current) => new Set(current).add(personId));
    markDirty();
  }

  function removeMember(personId: number) {
    setMemberIds((current) => {
      const next = new Set(current);
      next.delete(personId);
      return next;
    });
    markDirty();
  }

  function toggleStatus(status: StatusFilter) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  function changeSort(
    key: SortKey,
    currentKey: SortKey | null,
    currentDirection: TableSortDirection,
    setKey: (key: SortKey | null) => void,
    setDirection: (direction: TableSortDirection) => void,
  ) {
    if (key === currentKey) {
      if (currentDirection === "descending") {
        setKey(null);
        setDirection("ascending");
        return;
      }
      setDirection(currentDirection === "ascending" ? "descending" : "ascending");
      return;
    }
    setKey(key);
    setDirection("ascending");
  }

  const teamMembers = useMemo(
    () =>
      sortMembers(
        members.filter((member) => memberIds.has(member.personId)),
        teamSortKey,
        teamSortDirection,
      ),
    [members, memberIds, teamSortKey, teamSortDirection],
  );

  const candidateMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    const filtered = members.filter(
      (member) =>
        !memberIds.has(member.personId) &&
        selectedStatuses.includes(member.isFormerMember ? "ended" : "active") &&
        (!normalizedQuery || member.name.toLocaleLowerCase("en").includes(normalizedQuery)),
    );
    return sortMembers(filtered, candidateSortKey, candidateSortDirection);
  }, [members, memberIds, query, selectedStatuses, candidateSortKey, candidateSortDirection]);

  const statusFilterLabel =
    selectedStatuses.length === 2
      ? "Status: All"
      : selectedStatuses.length === 1
        ? `Status: ${selectedStatuses[0] === "active" ? "Active" : "Former members"}`
        : "Status: None";

  return (
    <>
      {[...memberIds].map((personId) => (
        <input key={personId} name="personIds" type="hidden" value={personId} />
      ))}

      <h2 className="mt-10 text-lg font-medium">Team members</h2>
      <p className="mt-2 text-sm opacity-60">
        Everyone currently on the team. Changes aren&apos;t saved until you press
        &quot;Save changes&quot;.
      </p>
      <MemberTable
        actionIcon="person_remove"
        actionLabel="Remove"
        emptyMessage="No members in this team yet."
        members={teamMembers}
        onAction={removeMember}
        onSort={(key) =>
          changeSort(
            key,
            teamSortKey,
            teamSortDirection,
            setTeamSortKey,
            setTeamSortDirection,
          )
        }
        sortDirection={teamSortDirection}
        sortKey={teamSortKey}
      />

      <h2 className="mt-10 text-lg font-medium">Add members</h2>
      <p className="mt-2 text-sm opacity-60">
        Add new members to the team. Changes aren&apos;t saved until you press
        &quot;Save changes&quot;.
      </p>
      <div
        className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
        onChange={(event) => event.stopPropagation()}
      >
        <FilterMenu icon="filter_alt" label={statusFilterLabel}>
          <fieldset>
            <legend className="section-label mb-2 opacity-45">Status</legend>
            <CheckboxOption
              checked={selectedStatuses.includes("active")}
              label="Active"
              onChange={() => toggleStatus("active")}
            />
            <CheckboxOption
              checked={selectedStatuses.includes("ended")}
              label="Former members"
              onChange={() => toggleStatus("ended")}
            />
          </fieldset>
        </FilterMenu>

        <label className="relative min-w-0 flex-1 xl:w-72 xl:flex-none">
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
      </div>
      <MemberTable
        actionIcon="person_add"
        actionLabel="Add"
        emptyMessage="No organization members match these filters."
        members={candidateMembers}
        onAction={addMember}
        onSort={(key) =>
          changeSort(
            key,
            candidateSortKey,
            candidateSortDirection,
            setCandidateSortKey,
            setCandidateSortDirection,
          )
        }
        sortDirection={candidateSortDirection}
        sortKey={candidateSortKey}
      />
    </>
  );
}
