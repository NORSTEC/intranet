import Link from "next/link";
import { PageHeader } from "@/components/portal/page-header";
import { requirePortalAccess } from "@/lib/auth/access";

const activity = [
  ["Ada Fjell joined Propulsion", "Today"],
  ["Jonas Strand updated their profile", "Yesterday"],
  ["Mina Isaksen became an alumnus", "28 July"],
];

export default async function DashboardPage() {
  const access = await requirePortalAccess();
  const canAdminister = access.membership.role !== "member";

  return (
    <>
      <PageHeader title="Dashboard" description={access.membership.organizationName} />

      <section className="grid border-b-2 border-moody md:grid-cols-3 md:divide-x-2 md:divide-moody">
        <div className="border-t-2 border-moody py-5 md:border-0 md:px-6 md:first:pl-0">
          <p className="section-label opacity-50">Membership</p>
          <p className="mt-2 text-xl">Active</p>
        </div>
        <div className="border-t-2 border-moody py-5 md:border-0 md:px-6">
          <p className="section-label opacity-50">Team</p>
          <p className="mt-2 text-xl">Propulsion</p>
        </div>
        <div className="border-t-2 border-moody py-5 md:border-0 md:px-6">
          <p className="section-label opacity-50">Members</p>
          <p className="mt-2 text-xl">128</p>
        </div>
      </section>

      <div className="mt-14 grid gap-14 lg:grid-cols-2 lg:gap-20">
        <section>
          <h2 className="text-h2">Next</h2>
          <div className="mt-5 border-t-2 border-moody">
            <Link href="/profile" className="group flex items-center justify-between border-b border-moody/25 py-5">
              <span><span className="block font-medium">Complete your profile</span><span className="text-sm opacity-50">Add study year</span></span>
              <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_right_alt</span>
            </Link>
            {canAdminister && (
              <Link href="/organization" className="group flex items-center justify-between border-b border-moody/25 py-5">
                <span><span className="block font-medium">Review access requests</span></span>
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_right_alt</span>
              </Link>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-h2">Recent activity</h2>
          <div className="mt-5 border-t-2 border-moody">
            {activity.map(([label, date]) => (
              <div key={label} className="flex items-start justify-between gap-5 border-b border-moody/25 py-5">
                <p className="text-sm">{label}</p><time className="shrink-0 text-xs opacity-45">{date}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
