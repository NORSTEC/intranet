import {
  AccessReviewTable,
  type AccessReviewRequest,
} from "@/components/portal/access-review-table";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type RequesterRow = {
  full_name: string | null;
  person_emails: Array<{ email: string; is_primary: boolean }>;
};

type AccessRequestRow = {
  created_at: string;
  field_of_study: string | null;
  id: number;
  message: string | null;
  organization_id: number | null;
  organizations: { name: string } | Array<{ name: string }> | null;
  people: RequesterRow | RequesterRow[] | null;
  request_type: "organization" | "alumni";
  study_year: number | null;
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
  // when they are a portal administrator. Only undecided requests belong
  // here — an approved, declined or withdrawn one is settled, and what
  // happened to it is read from the audit log.
  const requestsResult = await supabase
    .from("access_requests")
    .select(
      "id, created_at, field_of_study, message, organization_id, request_type, study_year, organizations (name), people!access_requests_person_id_fkey (full_name, person_emails (email, is_primary))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsResult.error) {
    throw new Error("Could not load access requests");
  }

  const requestRows = requestsResult.data as AccessRequestRow[];

  const requests: AccessReviewRequest[] = requestRows.map((row) => {
    const requester = single(row.people);
    const emails = [...(requester?.person_emails ?? [])].sort(
      (left, right) => Number(right.is_primary) - Number(left.is_primary),
    );

    return {
      createdAt: row.created_at,
      email: emails[0]?.email ?? null,
      fieldOfStudy: row.field_of_study,
      id: row.id,
      message: row.message,
      organizationId: row.organization_id,
      organizationName: single(row.organizations)?.name ?? null,
      requesterName: requester?.full_name ?? "Unnamed member",
      requestType: row.request_type,
      studyYear: row.study_year,
      submittedLabel: formatMoment(row.created_at) ?? "",
    } satisfies AccessReviewRequest;
  });

  return (
    <>
      {requests.length > 0 && (
        <p className="max-w-2xl text-sm opacity-55">
          {requests.length === 1
            ? "1 request is waiting for a decision."
            : `${requests.length} requests are waiting for a decision.`}
        </p>
      )}
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
