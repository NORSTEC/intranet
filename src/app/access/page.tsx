import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/portal/portal-shell";
import { submitAccessRequest } from "@/app/access/actions";
import { getPortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type Organization = { id: number; name: string };
type AccessRequest = {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  organizations: { name: string } | { name: string }[];
};

const errorMessages: Record<string, string> = {
  invalid_request: "Check the information and try again.",
  already_pending: "You already have a pending request for this organization.",
  request_failed: "The request could not be submitted. Please try again.",
};

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const access = await getPortalAccess();
  const { error, submitted } = await searchParams;

  if (access.status === "unauthenticated") {
    redirect("/login");
  }

  if (access.status === "error") {
    redirect("/login?error=authorization");
  }

  if (access.membership) {
    redirect("/");
  }

  const supabase = await createClient();
  const [organizationsResult, requestsResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("access_requests")
      .select("id, status, organizations (name)")
      .eq("user_id", access.profile.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (organizationsResult.error || requestsResult.error) {
    redirect("/login?error=authorization");
  }

  const organizations = (organizationsResult.data ?? []) as Organization[];
  const pendingRequest = requestsResult.data as AccessRequest | null;
  const pendingOrganization = pendingRequest
    ? Array.isArray(pendingRequest.organizations)
      ? pendingRequest.organizations[0]?.name
      : pendingRequest.organizations.name
    : null;

  return (
    <main className="min-h-screen bg-egg px-5 py-6 text-moody sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b-2 border-moody pb-5">
        <Link href="/login" className="flex items-center gap-3"><Image src="/images/logo.png" alt="Norstec" width={36} height={36} className="portal-logo" /><span className="font-display text-xl tracking-wide">NORSTEC</span></Link>
        <ThemeToggle compact />
      </header>
      <div className="mx-auto max-w-2xl py-12 lg:py-20">
        <form action="/auth/signout" method="post">
          <button type="submit" className="mb-8 inline-flex cursor-pointer items-center gap-2 text-sm">
            <span className="material-symbols-outlined rotate-180 text-[1.15rem]">arrow_right_alt</span>
            Use another account
          </button>
        </form>
        <h1 className="text-h1">Request access<span aria-hidden className="page-star" /></h1>
        <p className="mt-4 text-sm opacity-55">
          Signed in as {access.profile.email}. Your request must be approved before you can enter the portal.
        </p>

        {(submitted === "true" || pendingRequest) ? (
          <section className="mt-12 border-y-2 border-moody py-7">
            <p className="section-label opacity-50">Request received</p>
            <p className="mt-2 text-xl">Pending approval</p>
            {pendingOrganization && (
              <p className="mt-2 text-sm opacity-55">{pendingOrganization}</p>
            )}
          </section>
        ) : (
          <form action={submitAccessRequest} className="mt-12 space-y-6">
            {error && errorMessages[error] && (
              <p className="text-sm text-[#a33b2b]" role="alert">{errorMessages[error]}</p>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="flex flex-col gap-2"><span className="section-label">First name</span><input name="firstName" className="portal-field" defaultValue={access.profile.firstName ?? ""} maxLength={80} autoComplete="given-name" required /></label>
              <label className="flex flex-col gap-2"><span className="section-label">Last name</span><input name="lastName" className="portal-field" defaultValue={access.profile.lastName ?? ""} maxLength={80} autoComplete="family-name" required /></label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="section-label">Organization</span>
              <select name="organizationId" className="portal-field" defaultValue="" required>
                <option value="" disabled>Select organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="flex flex-col gap-2"><span className="section-label">Field of study</span><input name="fieldOfStudy" className="portal-field" defaultValue={access.profile.fieldOfStudy ?? ""} maxLength={160} /></label>
              <label className="flex flex-col gap-2">
                <span className="section-label">Study year</span>
                <select name="studyYear" className="portal-field" defaultValue={access.profile.studyYear ?? ""} required>
                  <option value="" disabled>Select year</option>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-2"><span className="section-label">Message</span><textarea name="message" className="portal-field min-h-32 resize-y" maxLength={2000} /></label>
            <button className="portal-button" type="submit">Send request<span className="material-symbols-outlined">arrow_right_alt</span></button>
          </form>
        )}
      </div>
    </main>
  );
}
