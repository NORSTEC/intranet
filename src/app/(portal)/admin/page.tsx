import { requirePortalAdminAccess } from "@/lib/auth/access";

const organizations = [
  ["Orbit NTNU", "orbitntnu.com", "128", "Active"],
  ["Interstellar NTNU", "interstellarntnu.no", "76", "Active"],
  ["Portal Space", "portalspace.no", "41", "Review"],
  ["Propulse NTNU", "propulsentnu.no", "54", "Active"],
];

export default async function AdminPage() {
  await requirePortalAdminAccess();

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3">
        {[["Organizations", "8"], ["Members", "624"], ["Admins", "23"]].map(([label, value]) => (
          <article key={label} className="portal-surface p-6">
            <p className="section-label opacity-50">{label}</p>
            <p className="mt-3 text-4xl font-light">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-h2">Organizations</h2>
          <button className="portal-button" type="button">
            <span className="material-symbols-outlined text-[1.15rem]">add</span>Add
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {organizations.map(([name, domain, members, status]) => (
            <button
              key={name}
              type="button"
              className="portal-surface portal-card-link group flex min-h-44 flex-col items-start p-6 text-left"
            >
              <div className="flex w-full items-start justify-between gap-4">
                <span className="portal-pill">
                  {status}
                </span>
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">trending_flat</span>
              </div>
              <span className="mt-7 text-xl font-medium">{name}</span>
              <span className="mt-1 text-sm opacity-50">{domain}</span>
              <span className="portal-pill portal-pill-outline mt-auto">{members} members</span>
            </button>
          ))}
        </div>
      </section>

      <section className="portal-surface mt-10 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-copper text-moody-static">
          <span className="material-symbols-outlined">warning</span>
        </span>
        <div>
          <h2 className="font-medium">Access review</h2>
          <p className="mt-1 text-sm opacity-55">2 administrator roles need review.</p>
        </div>
        <button className="portal-button sm:ml-auto" type="button">Review</button>
      </section>
    </>
  );
}
