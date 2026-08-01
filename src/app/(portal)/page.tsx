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
      <PageHeader description={access.membership.organizationName} />

      <section aria-label="Membership overview" className="flex flex-wrap gap-3">
        <span className="portal-pill">
          <span className="size-2 rounded-full bg-beachball" />Active membership
        </span>
        <span className="portal-pill portal-pill-outline">Propulsion team</span>
        <span className="portal-pill portal-pill-outline">128 members</span>
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <section>
          <h2 className="text-h2">Next</h2>
          <div className="mt-6 grid gap-4">
            <Link
              href="/profile"
              className="portal-surface portal-card-link group flex items-center justify-between gap-6 p-6 sm:p-7"
            >
              <span>
                <span className="block text-h3 font-medium">Complete your profile</span>
                <span className="mt-2 block text-sm opacity-55">Add your study year</span>
              </span>
              <span className="portal-pill portal-pill-filled">
                Open<span className="material-symbols-outlined text-[1rem]">trending_flat</span>
              </span>
            </Link>
            {canAdminister && (
              <Link
                href="/organization"
                className="portal-surface portal-card-link group flex items-center justify-between gap-6 p-6 sm:p-7"
              >
                <span>
                  <span className="block text-h3 font-medium">Review access requests</span>
                  <span className="mt-2 block text-sm opacity-55">3 requests are waiting</span>
                </span>
                <span className="portal-pill portal-pill-filled">
                  Review<span className="material-symbols-outlined text-[1rem]">trending_flat</span>
                </span>
              </Link>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-h2">Recent activity</h2>
          <div className="portal-surface mt-6 space-y-3 p-4 sm:p-5">
            {activity.map(([label, date]) => (
              <div
                key={label}
                className="flex items-start justify-between gap-5 rounded-2xl bg-egg/60 p-4"
              >
                <p className="text-sm">{label}</p>
                <time className="portal-pill portal-pill-outline shrink-0">{date}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
