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

export type AccessReviewRequest = {
  createdAt: string;
  email: string | null;
  fieldOfStudy: string | null;
  id: number;
  message: string | null;
  organizationId: number | null;
  organizationName: string | null;
  requesterName: string;
  requestType: "organization" | "alumni";
  studyYear: number | null;
  submittedLabel: string;
};

type ReviewScope = number | "alumni";
type SortKey = "requester" | "type" | "organization" | "submitted";

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

/** Escape closes any dialog on this page, unless a decision is being saved. */
function useCloseOnEscape(onClose: () => void, blocked: boolean) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !blocked) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [blocked, onClose]);
}

function DialogFrame({
  children,
  labelledBy,
  role = "dialog",
}: {
  children: React.ReactNode;
  labelledBy: string;
  role?: "dialog" | "alertdialog";
}) {
  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role={role}
    >
      <div className="portal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto p-7 sm:p-8">
        {children}
      </div>
    </div>
  );
}

/**
 * Everything one request holds, and nothing to do about it.
 *
 * Deciding lives on the row this opened from, so reading and acting stay
 * separate: closing puts the two decision buttons back under the cursor rather
 * than stacking a confirmation on top of a dialog.
 */
function DetailsDialog({
  onClose,
  request,
}: {
  onClose: () => void;
  request: AccessReviewRequest;
}) {
  useCloseOnEscape(onClose, false);

  return (
    <DialogFrame labelledBy="access-request-details-title">
      <h2 className="text-2xl font-medium" id="access-request-details-title">
        {request.requesterName}
      </h2>

      <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
        <DetailItem label="Email">{request.email ?? "Not provided"}</DetailItem>
        <DetailItem label="Requested access">{typeLabel(request)}</DetailItem>
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
      </dl>

      <div className="mt-7">
        <button
          autoFocus
          className="portal-button"
          onClick={onClose}
          type="button"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            close
          </span>
          Close
        </button>
      </div>
    </DialogFrame>
  );
}

/**
 * The confirmation both decisions share. Granting portal access and turning
 * someone away are each one click away in the table, so neither goes through
 * without a second one — and the note the requester will read is written here.
 */
function DecisionDialog({
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

  useCloseOnEscape(onCancel, pending);

  return (
    <DialogFrame labelledBy="access-decision-title" role="alertdialog">
      <h2 className="text-2xl font-medium" id="access-decision-title">
        {approving ? "Grant portal access?" : "Decline this request?"}
      </h2>
      <p className="mt-4 leading-relaxed opacity-65">
        {approving
          ? request.requestType === "alumni"
            ? `${request.requesterName} gets alumni access to the portal. No organization membership is created, and they get an email telling them they are in.`
            : `${request.requesterName} becomes an active member of ${accessLabel(request)}, and gets an email telling them they are in.`
          : `${request.requesterName} keeps no access and can send a new request whenever they like. They get an email with your note.`}
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
          className={`portal-button${approving ? "" : " portal-button-danger"}`}
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
          {pending ? "Saving…" : approving ? "Approve" : "Decline"}
        </button>
      </div>
    </DialogFrame>
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
  const [selectedScopes, setSelectedScopes] = useState<ReviewScope[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>("ascending");
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [deciding, setDeciding] = useState<{
    decision: "approved" | "rejected";
    requestId: number;
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
          if (sortKey === "type") return typeLabel(request);
          if (sortKey === "organization") return organizationLabel(request) ?? "";
          return request.requesterName;
        };
        const comparison = value(left).localeCompare(value(right), "en", {
          sensitivity: "base",
        });
        return sortDirection === "ascending" ? comparison : -comparison;
      });
  }, [query, requests, selectedScopes, sortDirection, sortKey]);

  const detailed = requests.find((request) => request.id === detailsId) ?? null;
  const decidingRequest =
    requests.find((request) => request.id === deciding?.requestId) ?? null;

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

  function closeDecision() {
    setDeciding(null);
    setNote("");
  }

  function confirmDecision() {
    if (!deciding) return;

    startTransition(async () => {
      const result = await reviewAccessRequest({
        decision: deciding.decision,
        note,
        requestId: deciding.requestId,
      });
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      // A refused decision leaves the dialog open with the note intact, so it
      // can be tried again without retyping it.
      if (!result.ok) return;
      closeDecision();
      router.refresh();
    });
  }

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

      {requests.length > 0 && (
        <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
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
              type="text"
              value={query}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
              search
            </span>
          </label>
        </div>
      )}

      {visibleRequests.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          {/* Three buttons in the last cell need the room; below this the
              table scrolls sideways rather than cramping them. */}
          <table className="w-full min-w-[60rem] border-collapse">
            <caption className="sr-only">
              Access requests waiting for a decision, with who asked, the access
              they asked for, and the organization it belongs to
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["requester", "Name"],
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="portal-button whitespace-nowrap"
                        onClick={() => setDetailsId(request.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          visibility
                        </span>
                        Details
                      </button>
                      <button
                        className="portal-button whitespace-nowrap"
                        onClick={() => {
                          setNote("");
                          setDeciding({
                            decision: "approved",
                            requestId: request.id,
                          });
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          person_check
                        </span>
                        Approve
                      </button>
                      <button
                        className="portal-button portal-button-danger whitespace-nowrap"
                        onClick={() => {
                          setNote("");
                          setDeciding({
                            decision: "rejected",
                            requestId: request.id,
                          });
                        }}
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

      {detailed && (
        <DetailsDialog onClose={() => setDetailsId(null)} request={detailed} />
      )}

      {deciding && decidingRequest && (
        <DecisionDialog
          decision={deciding.decision}
          note={note}
          onCancel={closeDecision}
          onConfirm={confirmDecision}
          onNoteChange={setNote}
          pending={pending}
          request={decidingRequest}
        />
      )}
    </>
  );
}
