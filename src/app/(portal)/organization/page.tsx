import { PageHeader } from "@/components/portal/page-header";
import { requirePortalRole } from "@/lib/auth/access";

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
  const access = await requirePortalRole(["organization_admin", "norstec_admin"]);

  return (
    <>
      <PageHeader title="Organization" description={access.membership.organizationName} />

      <section>
        <div className="flex items-center justify-between"><h2 className="text-h2">Access requests</h2><span className="text-sm text-copper">3 pending</span></div>
        <div className="mt-5 border-t-2 border-moody">
          {requests.map(([name, email]) => (
            <div key={email} className="flex flex-col gap-4 border-b border-moody/25 py-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="font-medium">{name}</p><p className="truncate text-sm opacity-50">{email}</p></div>
              <div className="flex gap-2">
                <button className="portal-button" type="button">Approve</button>
                <button className="portal-button portal-button-secondary" type="button">Decline</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-h2">Members</h2>
          <div className="flex gap-3">
            <label className="relative"><span className="sr-only">Search members</span><input className="portal-field min-w-0 pr-10 sm:w-64" placeholder="Search" /><span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[1.15rem] opacity-50">search</span></label>
            <button className="portal-button" type="button"><span className="material-symbols-outlined text-[1.15rem]">person_add</span><span className="hidden sm:inline">Invite</span></button>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto border-t-2 border-moody">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead><tr className="border-b border-moody/25"><th className="py-4 font-medium">Name</th><th className="py-4 font-medium">Team</th><th className="py-4 font-medium">Role</th><th className="py-4 font-medium">Status</th><th className="py-4" /></tr></thead>
            <tbody>{members.map(([name, team, role, status]) => <tr key={name} className="border-b border-moody/25"><td className="py-4 font-medium">{name}</td><td className="py-4 opacity-60">{team}</td><td className="py-4 opacity-60">{role}</td><td className={`py-4 ${status === "Alumni" ? "opacity-50" : ""}`}>{status}</td><td className="py-4 text-right"><button type="button" aria-label={`Actions for ${name}`}><span className="material-symbols-outlined">more_horiz</span></button></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
