import { PageHeader } from "@/components/portal/page-header";
import { requirePortalRole } from "@/lib/auth/access";

const organizations = [
  ["Orbit NTNU", "orbitntnu.com", "128", "Active"],
  ["Interstellar NTNU", "interstellarntnu.no", "76", "Active"],
  ["Portal Space", "portalspace.no", "41", "Review"],
  ["Propulse NTNU", "propulsentnu.no", "54", "Active"],
];

export default async function AdminPage() {
  await requirePortalRole(["norstec_admin"]);

  return (
    <>
      <PageHeader title="Norstec admin" />
      <section className="grid border-b-2 border-moody md:grid-cols-3 md:divide-x-2 md:divide-moody">
        {[["Organizations", "8"], ["Members", "624"], ["Admins", "23"]].map(([label, value]) => (
          <div key={label} className="border-t-2 border-moody py-5 md:border-0 md:px-6 md:first:pl-0"><p className="section-label opacity-50">{label}</p><p className="mt-2 text-2xl">{value}</p></div>
        ))}
      </section>
      <section className="mt-14">
        <div className="flex items-center justify-between"><h2 className="text-h2">Organizations</h2><button className="portal-button" type="button"><span className="material-symbols-outlined text-[1.15rem]">add</span>Add</button></div>
        <div className="mt-5 border-t-2 border-moody">
          {organizations.map(([name, domain, members, status]) => (
            <button key={name} type="button" className="group grid w-full items-center gap-2 border-b border-moody/25 py-5 text-left sm:grid-cols-[1fr_1fr_auto_auto] sm:gap-8">
              <span className="font-medium">{name}</span><span className="text-sm opacity-50">{domain}</span><span className="text-sm">{members} members</span><span className={`flex items-center gap-3 text-sm ${status === "Review" ? "text-copper" : ""}`}>{status}<span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_right_alt</span></span>
            </button>
          ))}
        </div>
      </section>
      <section className="mt-14 border-t-2 border-moody pt-5">
        <div className="flex items-start gap-3"><span className="material-symbols-outlined text-copper">warning</span><div><h2 className="font-medium">Access review</h2><p className="mt-1 text-sm opacity-55">2 administrator roles need review.</p></div><button className="portal-button portal-button-secondary ml-auto" type="button">Review</button></div>
      </section>
    </>
  );
}
