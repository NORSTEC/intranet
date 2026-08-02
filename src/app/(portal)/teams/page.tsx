import { PageHeader } from "@/components/portal/page-header";
import { requirePortalAccess } from "@/lib/auth/access";

const teams = [
  ["Propulsion", "Engine development and testing", "16", "Engineering"],
  ["Avionics", "Flight computers and telemetry", "12", "Engineering"],
  ["Structures", "Airframe and mechanical integration", "21", "Engineering"],
  ["Business", "Partnerships and operations", "9", "Operations"],
];

export default async function TeamsPage() {
  const access = await requirePortalAccess();
  const canAdminister = access.memberships.some(
    (membership) =>
      membership.status === "active" && membership.role === "organization_admin",
  );

  return (
    <>
      <PageHeader description={access.membership.organizationName} />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" aria-label="Team filters">
          <button className="portal-pill portal-pill-filled" type="button">All teams</button>
          <button className="portal-pill portal-pill-outline" type="button">Engineering</button>
          <button className="portal-pill portal-pill-outline" type="button">Operations</button>
        </div>
        {canAdminister && (
          <button className="portal-button" type="button">
            <span className="material-symbols-outlined text-[1.15rem]">add</span>New team
          </button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map(([name, description, members, category], index) => (
          <button
            key={name}
            type="button"
            className="portal-surface portal-card-link group flex min-h-56 flex-col items-start p-6 text-left sm:p-7"
          >
            <div className="flex w-full items-start justify-between gap-4">
              <span className="portal-pill portal-pill-outline">{category}</span>
              <span
                className={`size-3 rounded-full ${
                  ["bg-copper", "bg-sun", "bg-beachball", "bg-sky"][index]
                }`}
              />
            </div>
            <span className="mt-8 text-2xl font-medium uppercase">{name}</span>
            <span className="mt-3 text-sm opacity-55">{description}</span>
            <span className="mt-auto flex w-full items-center justify-between pt-7">
              <span className="portal-pill">{members} members</span>
              <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">trending_flat</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
