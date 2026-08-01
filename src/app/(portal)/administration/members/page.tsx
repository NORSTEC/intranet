import { PageHeader } from "@/components/portal/page-header";
import { requirePortalRole } from "@/lib/auth/access";

const members = [["Ada Fjell", "Orbit NTNU", "Active"], ["Jonas Strand", "Orbit NTNU", "Active"], ["Mina Isaksen", "Portal Space", "Alumni"], ["Lars Krogh", "Propulse NTNU", "Active"]];

export default async function MemberStatusPage() {
  const access = await requirePortalRole(["organization_admin", "norstec_admin"]);
  const globalScope = access.membership.role === "norstec_admin";
  const administeredOrganizations = access.memberships.filter((membership) => membership.role === "organization_admin");
  const scopeLabel = globalScope ? "All organizations" : administeredOrganizations.length > 1 ? `${administeredOrganizations.length} organizations` : access.membership.organizationName;

  return (
    <>
      <PageHeader description={scopeLabel} />
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2"><button className="portal-pill" type="button">Active</button><button className="portal-pill portal-pill-outline" type="button">Alumni</button>{(globalScope || administeredOrganizations.length > 1) && <button className="portal-pill portal-pill-outline" type="button">Organization</button>}</div>
        <input className="portal-field w-full sm:w-72" placeholder="Search members" />
      </div>
      <section className="grid gap-3">
        {members.map(([name, organization, status]) => (
          <article key={`${name}-${organization}`} className="portal-surface grid items-center gap-4 p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:px-6">
            <p className="font-medium">{name}</p><p className="text-sm opacity-55">{organization}</p><span className="portal-pill portal-pill-outline">{status}</span><button className="portal-pill" type="button">Change status</button>
          </article>
        ))}
      </section>
    </>
  );
}
