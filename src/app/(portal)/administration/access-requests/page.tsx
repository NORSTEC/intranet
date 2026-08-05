import {
  AccessReviewTable,
  type AccessReviewRequest,
  type AccessReviewStatus,
} from "@/components/portal/access-review-table";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type RequesterRow = {
  full_name: string | null;
  person_emails: Array<{ email: string; is_primary: boolean }>;
};

type ReviewerRow = { full_name: string | null };

type AccessRequestRow = {
  created_at: string;
  decision_note: string | null;
  field_of_study: string | null;
  id: number;
  message: string | null;
  organization_id: number | null;
  organizations: { name: string } | Array<{ name: string }> | null;
  people: RequesterRow | RequesterRow[] | null;
  request_type: "organization" | "alumni";
  reviewed_at: string | null;
  reviewer: ReviewerRow | ReviewerRow[] | null;
  status: AccessReviewStatus;
  study_year: number | null;
};

const statusRank: Record<AccessReviewStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
  cancelled: 3,
};

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatMoment(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AccessRequestsPage() {
  const access = await requireOrganizationAdminAccess();
  const supabase = await createClient();
  // Row level security narrows this to the requests the signed-in
  // administrator may decide: their own organizations, plus alumni requests
  // when they are a portal administrator.
  const requestsResult = await supabase
    .from("access_requests")
    .select(
      "id, created_at, decision_note, field_of_study, message, organization_id, request_type, reviewed_at, status, study_year, organizations (name), people!access_requests_person_id_fkey (full_name, person_emails (email, is_primary)), reviewer:people!access_requests_reviewed_by_person_id_fkey (full_name)",
    )
    .order("created_at", { ascending: false });

  if (requestsResult.error) {
    throw new Error("Could not load access requests");
  }

  const requestRows = requestsResult.data as AccessRequestRow[];

  const requests: AccessReviewRequest[] = requestRows
    .map((row) => {
      const requester = single(row.people);
      const emails = [...(requester?.person_emails ?? [])].sort(
        (left, right) => Number(right.is_primary) - Number(left.is_primary),
      );

      return {
        createdAt: row.created_at,
        decidedLabel: formatMoment(row.reviewed_at),
        decisionNote: row.decision_note,
        email: emails[0]?.email ?? null,
        fieldOfStudy: row.field_of_study,
        id: row.id,
        message: row.message,
        organizationId: row.organization_id,
        organizationName: single(row.organizations)?.name ?? null,
        requesterName: requester?.full_name ?? "Unnamed member",
        requestType: row.request_type,
        reviewerName: single(row.reviewer)?.full_name ?? null,
        status: row.status,
        studyYear: row.study_year,
        submittedLabel: formatMoment(row.created_at) ?? "",
      } satisfies AccessReviewRequest;
    })
    .sort(
      (left, right) =>
        statusRank[left.status] - statusRank[right.status] ||
        right.createdAt.localeCompare(left.createdAt),
    );

  return (
    <>
      <AccessReviewTable
        canReviewAlumni={access.isPortalAdmin}
        organizations={access.administeredOrganizations.map((organization) => ({
          id: organization.organizationId,
          name: organization.organizationName,
        }))}
        requests={requests}
      />
    </>
  );
}
