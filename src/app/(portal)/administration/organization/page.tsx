import { PageHeader } from "@/components/portal/page-header";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";

export default async function OrganizationSettingsPage() {
  const access = await requireOrganizationAdminAccess();
  const { administeredOrganizations } = access;
  const canSelectOrganization = administeredOrganizations.length > 1;

  return (
    <>
      <PageHeader description={canSelectOrganization ? "Select an organization to edit" : administeredOrganizations[0].organizationName} />
      {canSelectOrganization && <label className="mb-7 block max-w-md"><span className="section-label opacity-50">Organization</span><select className="portal-field mt-3">{administeredOrganizations.map((membership) => <option key={membership.organizationId}>{membership.organizationName}</option>)}</select></label>}
      <form className="grid max-w-4xl gap-5 sm:grid-cols-2">
        <label><span className="section-label opacity-50">Name</span><input className="portal-field mt-3" defaultValue={administeredOrganizations[0].organizationName} /></label>
        <label><span className="section-label opacity-50">Website</span><input className="portal-field mt-3" defaultValue="https://example.org" /></label>
        <label className="sm:col-span-2"><span className="section-label opacity-50">Description</span><textarea className="portal-field mt-3 min-h-32 resize-y" defaultValue="General information shown on the organization page." /></label>
        <div className="portal-surface flex min-h-40 items-center gap-5 p-6 sm:col-span-2"><span className="flex size-20 items-center justify-center rounded-full bg-beachball text-xl font-semibold text-moody-static">OR</span><div><p className="font-medium">Organization logo</p><button className="portal-button mt-4" type="button">Upload logo</button></div></div>
        <button className="portal-button w-fit sm:col-span-2" type="submit">Save changes</button>
      </form>
    </>
  );
}
