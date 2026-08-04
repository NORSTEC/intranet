"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { changeMemberStatus } from "@/app/(portal)/administration/members/actions";
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
import { YouPill } from "@/components/portal/you-pill";

type ManagedMember = {
  avatarUrl?: string;
  email: string | null;
  hasPersonalEmail: boolean;
  membershipId: number;
  name: string;
  personId: number;
  role: "member" | "organization_admin";
  status: "active" | "ended";
};

type StatusFilter = ManagedMember["status"];
type SortKey = "name" | "email" | "status";
function statusLabel(status: StatusFilter) {
  return status === "active" ? "Active" : "Former member";
}

function MemberConfirmation({
  member,
  onCancel,
  onConfirm,
  pending,
}: {
  member: ManagedMember;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const nextStatus = member.status === "active" ? "ended" : "active";
  const title = nextStatus === "active"
    ? "Reactivate membership?"
    : "End membership?";

  return (
    <div
      aria-labelledby="member-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="member-confirmation-title">
          {title}
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          {nextStatus === "active"
            ? `${member.name} will become an active member of this organization. Previous admin and team roles will not be restored.`
            : `${member.name}'s membership in this organization will end. Their profile and membership history will be preserved.`}
        </p>
        {nextStatus === "ended" && !member.hasPersonalEmail && (
          <div className="mt-5 rounded-2xl border border-copper p-4 text-sm leading-relaxed">
            <p className="font-medium">No personal email registered</p>
            <p className="mt-1 opacity-65">
              Ending is still allowed, but this person may lose sign-in access when their organization account is disabled. No email will be sent during testing.
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            autoFocus
            className="portal-button"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              close
            </span>
            Cancel
          </button>
          <button
            className="portal-button"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              {pending
                ? "progress_activity"
                : nextStatus === "active"
                  ? "person_check"
                  : "history"}
            </span>
            {pending
              ? "Updating…"
              : nextStatus === "active"
                ? "Reactivate"
                : "End membership"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemberStatusManager({
  currentPersonId,
  members,
  organizationName,
  organizationSlug,
}: {
  currentPersonId: number;
  members: ManagedMember[];
  organizationName: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter[]>([
    "active",
    "ended",
  ]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");
  const [selectedMember, setSelectedMember] = useState<ManagedMember | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return members
      .filter(
        (member) =>
          selectedStatuses.includes(member.status) &&
          (!normalizedQuery ||
            member.name.toLocaleLowerCase("en").includes(normalizedQuery) ||
            member.email?.toLocaleLowerCase("en").includes(normalizedQuery)),
      )
      .sort((left, right) => {
        if (!sortKey) return 0;
        const value = (member: ManagedMember) => {
          if (sortKey === "name") return member.name;
          if (sortKey === "email") return member.email ?? "";
          return statusLabel(member.status);
        };
        const comparison = value(left).localeCompare(value(right), "en", {
          sensitivity: "base",
        });
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [members, query, selectedStatuses, sortDirection, sortKey]);

  function toggleStatus(status: StatusFilter) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
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

  function confirmAction() {
    if (!selectedMember) return;
    const member = selectedMember;

    startTransition(async () => {
      const result = await changeMemberStatus({
        membershipId: member.membershipId,
        organizationSlug,
        status: member.status === "active" ? "ended" : "active",
      });
      setSelectedMember(null);
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
      {toast && <Toast key={toast.id} message={toast.message} status={toast.status} />}

      <h2 className="mb-8 text-2xl font-medium">{organizationName}</h2>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
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

      {visibleMembers.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <table className="min-w-[42rem] w-full border-collapse">
            <thead>
              <tr>
                <SortableTableHeader
                  active={sortKey === "name"}
                  direction={sortDirection}
                  onSort={() => changeSort("name")}
                >
                  Name
                </SortableTableHeader>
                <SortableTableHeader
                  active={sortKey === "email"}
                  direction={sortDirection}
                  onSort={() => changeSort("email")}
                >
                  Email
                </SortableTableHeader>
                <SortableTableHeader
                  active={sortKey === "status"}
                  direction={sortDirection}
                  onSort={() => changeSort("status")}
                >
                  Status
                </SortableTableHeader>
                <th className="pb-3 pr-4 text-right font-semibold italic" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr className="border-b border-moody" key={member.membershipId}>
                  <td className="py-3 pl-4 pr-5">
                    <div className="flex min-w-0 items-center gap-3 font-medium">
                      <MemberAvatar name={member.name} src={member.avatarUrl} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate">{member.name}</span>
                          {member.personId === currentPersonId && <YouPill />}
                        </span>
                        {member.role === "organization_admin" && (
                          <span className="mt-0.5 block text-xs font-normal opacity-50">
                            Organization admin
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-5">{member.email ?? "—"}</td>
                  <td className="py-3 pr-5">{statusLabel(member.status)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end">
                      <button
                        className="portal-button whitespace-nowrap"
                        onClick={() => setSelectedMember(member)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                          {member.status === "active" ? "history" : "person_check"}
                        </span>
                        {member.status === "active" ? "End membership" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-sm opacity-55">No members match these filters.</p>
      )}

      {selectedMember && (
        <MemberConfirmation
          member={selectedMember}
          onCancel={() => setSelectedMember(null)}
          onConfirm={confirmAction}
          pending={pending}
        />
      )}
    </>
  );
}
