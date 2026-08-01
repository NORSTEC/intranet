import { PageHeader } from "@/components/portal/page-header";
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
    ["Role", roleLabels[access.membership.role]],
  ];

  return (
    <>
      <PageHeader title="Profile" />
      <div className="flex items-center justify-between border-b-2 border-moody pb-5">
        <div><h2 className="text-h2">Personal information</h2><p className="mt-1 text-sm opacity-50">Visible to your organization</p></div>
        <button className="portal-button portal-button-secondary" type="button">
          <span className="material-symbols-outlined text-[1.1rem]">edit</span>Edit
        </button>
      </div>
      <dl>
        {details.map(([label, value]) => (
          <div key={label} className="grid border-b border-moody/25 py-5 sm:grid-cols-[14rem_1fr]">
            <dt className="section-label opacity-50">{label}</dt>
            <dd className={`mt-1 font-medium sm:mt-0 ${value === "Not provided" ? "text-copper" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-10 flex items-start gap-3 border-t-2 border-moody pt-5 text-sm">
        <span className="material-symbols-outlined text-[1.2rem]">verified_user</span>
        <p className="opacity-60">Identity verified by Google. Access is controlled by your Norstec membership.</p>
      </div>
    </>
  );
}
