"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { reviewAccessRequest } from "@/app/(portal)/administration/access-requests/actions";
import {
  CheckboxOption,
  FilterMenu,
} from "@/components/portal/members-directory";
import {
  SortableTableHeader,
  type TableSortDirection,
} from "@/components/portal/sortable-table-header";
import { Toast } from "@/components/portal/toast";

export type AccessReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type AccessReviewRequest = {
  createdAt: string;
  decidedLabel: string | null;
  decisionNote: string | null;
  email: string | null;
  fieldOfStudy: string | null;
  id: number;
  message: string | null;
  organizationId: number | null;
  organizationName: string | null;
  requesterName: string;
  requestType: "organization" | "alumni";
  reviewerName: string | null;
  status: AccessReviewStatus;
  studyYear: number | null;
  submittedLabel: string;
};

type ReviewScope = number | "alumni";
type SortKey = "requester" | "email" | "type" | "organization" | "submitted";

const statusLabels: Record<AccessReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Declined",
  cancelled: "Withdrawn",
};

const statusOrder: AccessReviewStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

/** What the person asked to become, independent of which organization. */
function typeLabel(request: AccessReviewRequest) {
  return request.requestType === "alumni" ? "Alumni" : "Member";
}

// Alumni access belongs to no organization: it is decided by a portal
// administrator and creates no membership, so the column has nothing to name.
function organizationLabel(request: AccessReviewRequest) {
  if (request.requestType === "alumni") return null;
  return request.organizationName ?? "Unknown organization";
}

function accessLabel(request: AccessReviewRequest) {
  return request.requestType === "alumni"
    ? "Alumni access"
    : (request.organizationName ?? "Unknown organization");
}

function scopeOf(request: AccessReviewRequest): ReviewScope {
  return request.requestType === "alumni"
    ? "alumni"
    : (request.organizationId ?? -1);
}

function DetailItem({
  children,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="section-label opacity-45">{label}</dt>
      <dd className="mt-1.5 leading-relaxed">{children}</dd>
    </div>
  );
}

/**
 * Everything one request holds, and the decision itself, in one place.
 *
 * A decision is an action taken on a queue rather than a record to link to, so
 * it happens over the table instead of on a page of its own: the queue is still
 * behind the dialog, and deciding returns to it without a navigation.
 */
function ReviewDialog({
  note,
  onClose,
  onDecide,
  onNoteChange,
  pendingDecision,
  request,
}: {
  note: string;
  onClose: () => void;
  onDecide: (decision: "approved" | "rejected") => void;
  onNoteChange: (note: string) => void;
  /** The decision being saved, so only the button that started it spins. */
  pendingDecision: "approved" | "rejected" | null;
  request: AccessReviewRequest;
}) {
  const decidable = request.status === "pending";
  const pending = pendingDecision !== null;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);

  return (
    <div
      aria-labelledby="access-review-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="dialog"
    >
      <div className="portal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="access-review-dialog-title">
          {request.requesterName}
        </h2>
        <p className="mt-3 leading-relaxed opacity-65">
          {request.requestType === "alumni"
            ? "Approving grants alumni access to the portal. No organization membership is created."
            : `Approving makes them an active member of ${accessLabel(request)}, able to sign in right away.`}
        </p>

        <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
          <DetailItem label="Email">{request.email ?? "Not provided"}</DetailItem>
          <DetailItem label="Requested access">
            {typeLabel(request)}
          </DetailItem>
          <DetailItem label="Organization">
            {organizationLabel(request) ?? "—"}
          </DetailItem>
          <DetailItem label="Submitted">{request.submittedLabel}</DetailItem>
          <DetailItem label="Field of study">
            {request.fieldOfStudy ?? "Not provided"}
          </DetailItem>
          <DetailItem label="Study year">
            {request.studyYear ?? "Not provided"}
          </DetailItem>
          <DetailItem label="Message" wide>
            <span className="block max-w-[70ch]">
              {request.message ?? "No message was added."}
            </span>
          </DetailItem>
          {!decidable && (
            <DetailItem label="Decision" wide>
              <span className="block max-w-[70ch]">
                {statusLabels[request.status]}
                {request.reviewerName ? ` by ${request.reviewerName}` : ""}
                {request.decidedLabel ? ` · ${request.decidedLabel}` : ""}
                {request.decisionNote && (
                  <span className="mt-2 block opacity-65">
                    “{request.decisionNote}”
                  </span>
                )}
              </span>
            </DetailItem>
          )}
        </dl>

        {decidable && (
          <label className="mt-7 grid gap-2">
            <span className="section-label opacity-45">
              Note to the requester (optional)
            </span>
            <textarea
              className="portal-field min-h-24 resize-y"
              disabled={pending}
              maxLength={1000}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Shown to them the next time they sign in."
              value={note}
            />
          </label>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            autoFocus
            className="portal-button"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              close
            </span>
            {decidable ? "Cancel" : "Close"}
          </button>
          {decidable && (
            <>
              <button
                className="portal-button"
                disabled={pending}
                onClick={() => onDecide("approved")}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-[1.1rem] ${
                    pendingDecision === "approved" ? "animate-spin" : ""
                  }`}
                >
                  {pendingDecision === "approved"
                    ? "progress_activity"
                    : "person_check"}
                </span>
                Approve
              </button>
              <button
                className="portal-button portal-button-danger"
                disabled={pending}
                onClick={() => onDecide("rejected")}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-[1.1rem] ${
                    pendingDecision === "rejected" ? "animate-spin" : ""
                  }`}
                >
                  {pendingDecision === "rejected" ? "progress_activity" : "block"}
                </span>
                Decline
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AccessReviewTable({
  canReviewAlumni,
  organizations,
  requests,
}: {
  canReviewAlumni: boolean;
  organizations: Array<{ id: number; name: string }>;
  requests: AccessReviewRequest[];
}) {
  const router = useRouter();
  const [selectedStatuses, setSelectedStatuses] = useState<AccessReviewStatus[]>(
    ["pending"],
  );
  const [selectedScopes, setSelectedScopes] = useState<ReviewScope[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [decidingAs, setDecidingAs] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const scopes = useMemo<Array<{ label: string; value: ReviewScope }>>(
    () => [
      ...organizations.map((organization) => ({
        label: organization.name,
        value: organization.id as ReviewScope,
      })),
      ...(canReviewAlumni
        ? [{ label: "Alumni access", value: "alumni" as ReviewScope }]
        : []),
    ],
    [canReviewAlumni, organizations],
  );

  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return requests
      .filter((request) => {
        if (!selectedStatuses.includes(request.status)) return false;
        if (
          selectedScopes.length > 0 &&
          !selectedScopes.includes(scopeOf(request))
        ) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          request.requesterName,
          request.email ?? "",
          accessLabel(request),
          request.fieldOfStudy ?? "",
          request.message ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("en")
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (!sortKey) return 0;
        if (sortKey === "submitted") {
          const comparison = left.createdAt.localeCompare(right.createdAt);
          return sortDirection === "ascending" ? comparison : -comparison;
        }
        const value = (request: AccessReviewRequest) => {
          if (sortKey === "email") return request.email ?? "";
          if (sortKey === "type") return typeLabel(request);
          if (sortKey === "organization") return organizationLabel(request) ?? "";
          return request.requesterName;
        };
        const comparison = value(left).localeCompare(value(right), "en", {
          sensitivity: "base",
        });
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [
    query,
    requests,
    selectedScopes,
    selectedStatuses,
    sortDirection,
    sortKey,
  ]);

  const reviewing =
    requests.find((request) => request.id === reviewingId) ?? null;
  const pendingCount = requests.filter(
    (request) => request.status === "pending",
  ).length;

  function toggleStatus(status: AccessReviewStatus) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  function toggleScope(scope: ReviewScope) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((candidate) => candidate !== scope)
        : [...current, scope],
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

  function closeReview() {
    setReviewingId(null);
    setDecidingAs(null);
    setNote("");
  }

  function decide(decision: "approved" | "rejected") {
    if (!reviewing) return;
    const requestId = reviewing.id;
    setDecidingAs(decision);

    startTransition(async () => {
      const result = await reviewAccessRequest({
        decision,
        note,
        requestId,
      });
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      // A refused decision leaves the dialog open with the note intact, so it
      // can be tried again without retyping it.
      if (!result.ok) {
        setDecidingAs(null);
        return;
      }
      closeReview();
      router.refresh();
    });
  }

  const statusFilterLabel =
    selectedStatuses.length === statusOrder.length
      ? "Status: All"
      : selectedStatuses.length === 1
        ? `Status: ${statusLabels[selectedStatuses[0]]}`
        : selectedStatuses.length === 0
          ? "Status: None"
          : `Status · ${selectedStatuses.length}`;
  const scopeFilterLabel =
    selectedScopes.length === 0 || selectedScopes.length === scopes.length
      ? "Requested access: All"
      : selectedScopes.length === 1
        ? `Requested access: ${
            scopes.find((scope) => scope.value === selectedScopes[0])?.label ??
            "Selected"
          }`
        : `Requested access · ${selectedScopes.length}`;

  return (
    <>
      {toast && <Toast key={toast.id} message={toast.message} status={toast.status} />}

      <p className="mb-8 max-w-2xl text-sm opacity-55">
        {pendingCount === 0
          ? "Nothing is waiting for a decision."
          : pendingCount === 1
            ? "1 request is waiting for a decision. Review it to see everything it holds."
            : `${pendingCount} requests are waiting for a decision. Review one to see everything it holds.`}
      </p>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterMenu icon="filter_alt" label={statusFilterLabel}>
            <fieldset>
              <legend className="section-label mb-2 opacity-45">Status</legend>
              {statusOrder.map((status) => (
                <CheckboxOption
                  checked={selectedStatuses.includes(status)}
                  key={status}
                  label={statusLabels[status]}
                  onChange={() => toggleStatus(status)}
                />
              ))}
            </fieldset>
          </FilterMenu>

          {scopes.length > 1 && (
            <FilterMenu icon="apartment" label={scopeFilterLabel}>
              <fieldset>
                <legend className="section-label mb-2 opacity-45">
                  Requested access
                </legend>
                <div className="max-h-72 overflow-y-auto pr-2">
                  {scopes.map((scope) => (
                    <CheckboxOption
                      checked={selectedScopes.includes(scope.value)}
                      key={String(scope.value)}
                      label={scope.label}
                      onChange={() => toggleScope(scope.value)}
                    />
                  ))}
                </div>
              </fieldset>
            </FilterMenu>
          )}
        </div>

        <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
          <span className="sr-only">Search access requests</span>
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

      {visibleRequests.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse">
            <caption className="sr-only">
              Access requests with who asked, the access they asked for, and the
              organization it belongs to
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["requester", "Name"],
                    ["email", "Email"],
                    ["type", "Requested access"],
                    ["organization", "Organization"],
                    ["submitted", "Submitted"],
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
              {visibleRequests.map((request) => (
                <tr className="border-b border-moody" key={request.id}>
                  <td className="py-3 pl-4 pr-5 font-medium">
                    {request.requesterName}
                  </td>
                  <td className="py-3 pr-5">
                    {request.email ?? "No email address"}
                  </td>
                  <td className="py-3 pr-5">{typeLabel(request)}</td>
                  <td className="py-3 pr-5">
                    {organizationLabel(request) ?? (
                      <span aria-label="No organization">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-5">
                    {request.submittedLabel}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex justify-end">
                      <button
                        className="portal-button whitespace-nowrap"
                        onClick={() => {
                          setNote("");
                          setReviewingId(request.id);
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          {request.status === "pending" ? "rate_review" : "visibility"}
                        </span>
                        {request.status === "pending" ? "Review" : "Details"}
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
          {requests.length === 0
            ? "No one has requested access yet."
            : "No requests match these filters."}
        </p>
      )}

      {reviewing && (
        <ReviewDialog
          note={note}
          onClose={closeReview}
          onDecide={decide}
          onNoteChange={setNote}
          pendingDecision={pending ? decidingAs : null}
          request={reviewing}
        />
      )}
    </>
  );
}
