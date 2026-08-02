import { reviewAccessRequest } from "@/app/(portal)/administration/access-requests/actions";
import { PageHeader } from "@/components/portal/page-header";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type RelatedName = { name: string } | Array<{ name: string }>;
type RelatedPerson =
  | { full_name: string | null }
  | Array<{ full_name: string | null }>;

type AccessRequest = {
  id: number;
  created_at: string;
  field_of_study: string | null;
  message: string | null;
  study_year: number | null;
  organizations: RelatedName;
  people: RelatedPerson;
};

function relatedName(value: RelatedName | null) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? "Unknown";
}

function personName(value: RelatedPerson) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.full_name ?? "Unnamed member";
}

function ReviewButtons({
  action,
  requestId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  requestId: number;
}) {
  return (
    <form action={action} className="mt-7 flex flex-wrap gap-2">
      <input name="requestId" type="hidden" value={requestId} />
      <button className="portal-button" name="decision" type="submit" value="approved">
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">check</span>
        Approve
      </button>
      <button className="portal-button" name="decision" type="submit" value="rejected">
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">close</span>
        Decline
      </button>
    </form>
  );
}

export default async function AccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reviewed?: string }>;
}) {
  const access = await requireOrganizationAdminAccess();
  const { error, reviewed } = await searchParams;
  const supabase = await createClient();
  const accessResult = await supabase
    .from("access_requests")
    .select("id, created_at, field_of_study, study_year, message, organizations (name), people!access_requests_person_id_fkey (full_name)")
    .eq("status", "pending")
    .order("created_at");

  if (accessResult.error) {
    throw new Error("Could not load access requests");
  }

  const accessRequests = accessResult.data as AccessRequest[];
  const pendingCount = accessRequests.length;

  return (
    <>
      <PageHeader
        description={
          access.administeredOrganizations.length === 1
            ? access.administeredOrganizations[0].organizationName
            : `${access.administeredOrganizations.length} organizations`
        }
      />
      {error && <p className="mb-6 font-medium text-copper" role="alert">The request could not be reviewed.</p>}
      {reviewed && <p className="mb-6 font-medium" role="status">Request {reviewed}.</p>}
      <p className="mb-10 text-sm opacity-55">
        {pendingCount === 1 ? "1 request awaiting review" : `${pendingCount} requests awaiting review`}
      </p>

      <section>
        <h2 className="text-h2">Portal access</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {accessRequests.map((request) => (
            <article className="portal-surface flex flex-col p-6" key={request.id}>
              <span className="portal-pill portal-pill-outline w-fit">{relatedName(request.organizations)}</span>
              <h3 className="mt-6 text-xl font-medium">{personName(request.people)}</h3>
              {(request.field_of_study || request.study_year) && (
                <p className="mt-2 text-sm opacity-55">
                  {[request.field_of_study, request.study_year ? `Year ${request.study_year}` : null].filter(Boolean).join(" · ")}
                </p>
              )}
              {request.message && <p className="mt-4 text-sm leading-relaxed opacity-65">{request.message}</p>}
              <ReviewButtons action={reviewAccessRequest} requestId={request.id} />
            </article>
          ))}
          {accessRequests.length === 0 && <p className="text-sm opacity-50">No portal access requests.</p>}
        </div>
      </section>
    </>
  );
}
