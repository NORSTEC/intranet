import { PageHeader } from "@/components/portal/page-header";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";

const teams = [["Propulsion", "16"], ["Avionics", "12"], ["Structures", "21"], ["Business", "9"]];

export default async function TeamManagementPage() {
  const access = await requireOrganizationAdminAccess();
  const { administeredOrganizations } = access;
  const scopeLabel = administeredOrganizations.length > 1 ? `${administeredOrganizations.length} organizations` : administeredOrganizations[0].organizationName;

  return (
    <>
      <PageHeader description={scopeLabel} />
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">{administeredOrganizations.length > 1 ? <button className="portal-pill" type="button">Filter organization</button> : <span /> }<button className="portal-button" type="button"><span className="material-symbols-outlined">add</span>New team</button></div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map(([name, memberCount]) => (
          <article key={name} className="portal-surface flex min-h-48 flex-col p-6"><span className="portal-pill portal-pill-outline">{memberCount} members</span><h2 className="mt-7 text-xl font-medium">{name}</h2><div className="mt-auto flex gap-2 pt-6"><button className="portal-pill" type="button">Edit</button><button className="portal-pill" type="button">Members</button></div></article>
        ))}
      </section>
    </>
  );
}
