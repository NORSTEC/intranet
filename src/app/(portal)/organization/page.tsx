import { PageHeader } from "@/components/portal/page-header";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";

const requests = [
  ["Emilie Moe", "emilie@orbitntnu.com"],
  ["Sander Lie", "sander@stud.ntnu.no"],
  ["Ingrid Kvalvik", "ingrid@orbitntnu.com"],
];

const members = [
  ["Ada Fjell", "Propulsion", "Member", "Active"],
  ["Jonas Strand", "Avionics", "Organization admin", "Active"],
  ["Mina Isaksen", "Structures", "Member", "Alumni"],
  ["Lars Krogh", "Propulsion", "Member", "Active"],
];

export default async function OrganizationPage() {
  const access = await requireOrganizationAdminAccess();

  return (
    <>
      <PageHeader
        description={
          access.administeredOrganizations.length === 1
            ? access.administeredOrganizations[0].organizationName
            : `${access.administeredOrganizations.length} organizations`
        }
      />

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-h2">Access requests</h2>
          <span className="portal-pill">3 pending</span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {requests.map(([name, email]) => (
            <article key={email} className="portal-surface flex flex-col p-6">
              <span className="portal-pill portal-pill-outline">Pending</span>
              <h3 className="mt-6 text-xl font-medium">{name}</h3>
              <p className="mt-1 truncate text-sm opacity-50">{email}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                <button className="portal-button" type="button">Approve</button>
                <button className="portal-button portal-button-secondary" type="button">Decline</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-h2">Members</h2>
          <div className="flex gap-3">
            <label className="relative">
              <span className="sr-only">Search members</span>
              <input className="portal-field min-w-0 pr-10 sm:w-64" placeholder="Search" />
              <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[1.15rem] opacity-50">search</span>
            </label>
            <button className="portal-button" type="button">
              <span className="material-symbols-outlined text-[1.15rem]">person_add</span>
              <span className="hidden sm:inline">Invite</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {members.map(([name, team, role, status]) => (
            <article
              key={name}
              className="portal-surface grid items-center gap-4 p-5 sm:grid-cols-[1.2fr_1fr_auto_auto] sm:px-6"
            >
              <div>
                <p className="font-medium">{name}</p>
                <p className="mt-1 text-sm opacity-45 sm:hidden">{team}</p>
              </div>
              <span className="hidden text-sm opacity-55 sm:block">{team}</span>
              <span className="portal-pill portal-pill-outline">{role}</span>
              <span className="portal-pill">
                {status}
              </span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
