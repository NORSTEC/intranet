import { requirePortalAccess } from "@/lib/auth/access";

const roleLabels = {
  member: "Member",
  organization_admin: "Organization admin",
  norstec_admin: "Norstec admin",
};

export default async function ProfilePage() {
  const access = await requirePortalAccess();
  const details = [
    ["Name", access.profile.fullName ?? "Not provided"],
    ["Organization", access.membership.organizationName],
    ["Email", access.profile.email],
    ["Field of study", access.profile.fieldOfStudy ?? "Not provided"],
    ["Study year", access.profile.studyYear?.toString() ?? "Not provided"],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h2">Personal information</h2>
          <p className="mt-2 text-sm opacity-50">Visible to your organization</p>
        </div>
        <button className="portal-button portal-button-secondary" type="button">
          <span className="material-symbols-outlined text-[1.1rem]">edit</span>Edit
        </button>
      </div>

      <dl className="mt-7 grid gap-4 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="portal-surface min-h-32 p-6">
            <dt className="section-label opacity-45">{label}</dt>
            <dd className={`mt-4 font-medium ${value === "Not provided" ? "text-copper" : ""}`}>
              {value}
            </dd>
          </div>
        ))}
        <div className="portal-surface min-h-32 p-6">
          <dt className="section-label opacity-45">Role</dt>
          <dd className="mt-4">
            <span className="portal-pill">
              {roleLabels[access.membership.role]}
            </span>
          </dd>
        </div>
      </dl>

      <div className="portal-surface mt-8 flex items-start gap-4 p-5 text-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beachball text-moody-static">
          <span className="material-symbols-outlined text-[1.2rem]">verified_user</span>
        </span>
        <div>
          <p className="font-medium">Google account verified</p>
          <p className="mt-1 opacity-55">Portal access follows your active Norstec membership.</p>
        </div>
      </div>
    </>
  );
}
