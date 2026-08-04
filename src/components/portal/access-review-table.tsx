"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { reviewAccessRequest } from "@/app/(portal)/administration/access-requests/actions";
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

export type AccessReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type AccessReviewRequest = {
  avatarUrl?: string;
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
type SortKey = "requester" | "access" | "submitted" | "status";

const statusMeta: Record<
  AccessReviewStatus,
  { dotClassName: string; label: string }
> = {
  pending: { dotClassName: "bg-sun", label: "Pending" },
  approved: { dotClassName: "bg-beachball", label: "Approved" },
  rejected: { dotClassName: "bg-copper", label: "Declined" },
  cancelled: { dotClassName: "bg-moody/30", label: "Withdrawn" },
};

const statusOrder: AccessReviewStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

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

function StatusPill({ status }: { status: AccessReviewStatus }) {
  const meta = statusMeta[status];

  return (
    <span className="portal-pill portal-pill-outline whitespace-nowrap">
      <span aria-hidden="true" className={`size-2 rounded-full ${meta.dotClassName}`} />
      {meta.label}
    </span>
  );
}

function DetailItem({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="section-label opacity-45">{label}</dt>
      <dd className="mt-1.5 leading-relaxed">{children}</dd>
    </div>
  );
}

function ReviewConfirmation({
  decision,
  note,
  onCancel,
  onConfirm,
  onNoteChange,
  pending,
  request,
}: {
  decision: "approved" | "rejected";
  note: string;
  onCancel: () => void;
  onConfirm: () => void;
  onNoteChange: (note: string) => void;
  pending: boolean;
  request: AccessReviewRequest;
}) {
  const approving = decision === "approved";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, pending]);

  return (
    <div
      aria-labelledby="access-review-confirmation-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-lg p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="access-review-confirmation-title">
          {approving ? "Grant portal access?" : "Decline this request?"}
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          {approving
            ? request.requestType === "alumni"
              ? `${request.requesterName} gets alumni access to the portal. No organization membership is created.`
              : `${request.requesterName} becomes an active member of ${accessLabel(request)} and can sign in right away.`
            : `${request.requesterName} keeps no access and sees your note the next time they sign in. They can send a new request afterwards.`}
        </p>

        <label className="mt-6 grid gap-2">
          <span className="section-label opacity-45">
            Note to the requester (optional)
          </span>
          <textarea
            autoFocus
            className="portal-field min-h-24 resize-y"
            disabled={pending}
            maxLength={1000}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={
              approving
                ? "Welcome aboard — you now have access."
                : "Why the request was declined."
            }
            value={note}
          />
        </label>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
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
            className={`portal-button ${approving ? "" : "portal-button-danger"}`}
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[1.1rem] ${pending ? "animate-spin" : ""}`}
            >
              {pending ? "progress_activity" : approving ? "person_check" : "block"}
            </span>
            {pending ? "Saving…" : approving ? "Grant access" : "Decline"}
          </button>
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [review, setReview] = useState<{
    decision: "approved" | "rejected";
    request: AccessReviewRequest;
  } | null>(null);
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
          if (sortKey === "access") return accessLabel(request);
          if (sortKey === "status") {
            return String(statusOrder.indexOf(request.status));
          }
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

  function openReview(
    request: AccessReviewRequest,
    decision: "approved" | "rejected",
  ) {
    setNote("");
    setReview({ decision, request });
  }

  function confirmReview() {
    if (!review) return;
    const { decision, request } = review;

    startTransition(async () => {
      const result = await reviewAccessRequest({
        decision,
        note,
        requestId: request.id,
      });
      setReview(null);
      setNote("");
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) {
        setExpandedId(null);
        router.refresh();
      }
    });
  }

  const statusFilterLabel =
    selectedStatuses.length === statusOrder.length
      ? "Status: All"
      : selectedStatuses.length === 1
        ? `Status: ${statusMeta[selectedStatuses[0]].label}`
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

      <p className="mb-8 text-sm opacity-55">
        {pendingCount === 0
          ? "Nothing is waiting for a decision."
          : pendingCount === 1
            ? "1 request is waiting for a decision."
            : `${pendingCount} requests are waiting for a decision.`}
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
                  label={statusMeta[status].label}
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

        <label className="relative min-w-0 flex-1 xl:w-72 xl:flex-none">
          <span className="sr-only">Search access requests</span>
          <input
            className="portal-field w-full pr-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search requests"
            type="text"
            value={query}
          />
          <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
            search
          </span>
        </label>
      </div>

      {visibleRequests.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse">
            <thead>
              <tr>
                {(
                  [
                    ["requester", "Requester"],
                    ["access", "Requested access"],
                    ["submitted", "Submitted"],
                    ["status", "Status"],
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
                <th className="pb-3 pr-4 text-right font-semibold italic" scope="col">
                  Review
                </th>
              </tr>
            </thead>
            {visibleRequests.map((request) => {
              const expanded = expandedId === request.id;
              const isPending = request.status === "pending";

              return (
                <tbody key={request.id}>
                  <tr className={expanded ? "" : "border-b border-moody"}>
                    <td className="py-3 pl-4 pr-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar
                          name={request.requesterName}
                          src={request.avatarUrl}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {request.requesterName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs opacity-55">
                            {request.email ?? "No email address"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-5">{accessLabel(request)}</td>
                    <td className="py-3 pr-5 whitespace-nowrap">
                      {request.submittedLabel}
                    </td>
                    <td className="py-3 pr-5">
                      <StatusPill status={request.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end">
                        <button
                          aria-controls={`access-request-detail-${request.id}`}
                          aria-expanded={expanded}
                          className="portal-button whitespace-nowrap"
                          onClick={() =>
                            setExpandedId(expanded ? null : request.id)
                          }
                          type="button"
                        >
                          {isPending ? "Review" : "Details"}
                          <span
                            aria-hidden="true"
                            className={`material-symbols-outlined text-[1.05rem] transition-transform ${expanded ? "rotate-180" : ""}`}
                          >
                            keyboard_arrow_down
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr
                      className="border-b border-moody"
                      id={`access-request-detail-${request.id}`}
                    >
                      <td className="pb-7 pl-4 pr-4" colSpan={5}>
                        {/* The table scrolls sideways on narrow screens; the
                            detail panel stays pinned to the viewport so its
                            text never scrolls out of reach. */}
                        <div className="portal-surface sticky left-4 w-full max-w-[calc(100vw-4.5rem)] p-5 sm:max-w-[calc(100vw-6rem)] sm:p-6 lg:max-w-none">
                          <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <DetailItem label="Field of study">
                              {request.fieldOfStudy ?? "Not provided"}
                            </DetailItem>
                            <DetailItem label="Study year">
                              {request.studyYear ?? "Not provided"}
                            </DetailItem>
                            <DetailItem label="Email">
                              {request.email ?? "Not provided"}
                            </DetailItem>
                            <DetailItem label="Submitted">
                              {request.submittedLabel}
                            </DetailItem>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <dt className="section-label opacity-45">Message</dt>
                              <dd className="mt-1.5 max-w-[70ch] leading-relaxed">
                                {request.message ?? "No message was added."}
                              </dd>
                            </div>
                            {!isPending && (
                              <div className="sm:col-span-2 lg:col-span-4">
                                <dt className="section-label opacity-45">
                                  Decision
                                </dt>
                                <dd className="mt-1.5 max-w-[70ch] leading-relaxed">
                                  {statusMeta[request.status].label}
                                  {request.reviewerName
                                    ? ` by ${request.reviewerName}`
                                    : ""}
                                  {request.decidedLabel
                                    ? ` · ${request.decidedLabel}`
                                    : ""}
                                  {request.decisionNote && (
                                    <span className="mt-2 block opacity-65">
                                      “{request.decisionNote}”
                                    </span>
                                  )}
                                </dd>
                              </div>
                            )}
                          </dl>

                          {isPending && (
                            <div className="mt-7 flex flex-wrap gap-3">
                              <button
                                className="portal-button"
                                onClick={() => openReview(request, "approved")}
                                type="button"
                              >
                                <span
                                  aria-hidden="true"
                                  className="material-symbols-outlined text-[1.1rem]"
                                >
                                  person_check
                                </span>
                                Grant access
                              </button>
                              <button
                                className="portal-button portal-button-danger"
                                onClick={() => openReview(request, "rejected")}
                                type="button"
                              >
                                <span
                                  aria-hidden="true"
                                  className="material-symbols-outlined text-[1.1rem]"
                                >
                                  block
                                </span>
                                Decline
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : (
        <p className="mt-8 text-sm opacity-55">
          {requests.length === 0
            ? "No one has requested access yet."
            : "No requests match these filters."}
        </p>
      )}

      {review && (
        <ReviewConfirmation
          decision={review.decision}
          note={note}
          onCancel={() => {
            setReview(null);
            setNote("");
          }}
          onConfirm={confirmReview}
          onNoteChange={setNote}
          pending={pending}
          request={review.request}
        />
      )}
    </>
  );
}
