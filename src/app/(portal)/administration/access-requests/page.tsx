import { PageHeader } from "@/components/portal/page-header";
import { requirePortalRole } from "@/lib/auth/access";

const requests = [["Emilie Moe", "emilie@orbitntnu.com", "Orbit NTNU"], ["Sander Lie", "sander@stud.ntnu.no", "Orbit NTNU"], ["Ingrid Kvalvik", "ingrid@interstellarntnu.no", "Interstellar NTNU"]];

export default async function AccessRequestsPage() {
  const access = await requirePortalRole(["organization_admin", "norstec_admin"]);
  const globalScope = access.membership.role === "norstec_admin";
  const administeredOrganizations = access.memberships.filter((membership) => membership.role === "organization_admin");
  const scopeLabel = globalScope
    ? "All organizations"
    : administeredOrganizations.length > 1
      ? `${administeredOrganizations.length} organizations`
      : access.membership.organizationName;

  return (
    <>
      <PageHeader description={scopeLabel} />
      <div className="mb-7 flex items-center justify-between gap-4"><span className="portal-pill">3 pending</span>{(globalScope || administeredOrganizations.length > 1) && <button className="portal-pill" type="button">Filter organization</button>}</div>
      <section className="grid gap-4 lg:grid-cols-3">
        {requests.map(([name, email, organization]) => (
          <article key={email} className="portal-surface flex flex-col p-6">
            <span className="portal-pill portal-pill-outline">{organization}</span>
            <h2 className="mt-6 text-xl font-medium">{name}</h2>
            <p className="mt-1 truncate text-sm opacity-50">{email}</p>
            <div className="mt-7 flex gap-2"><button className="portal-button" type="button">Approve</button><button className="portal-button" type="button">Decline</button></div>
          </article>
        ))}
      </section>
    </>
  );
}
