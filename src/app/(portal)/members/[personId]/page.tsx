import { notFound } from "next/navigation";
import { MemberProfileView } from "@/components/portal/member-profile-view";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { requirePortalAccess } from "@/lib/auth/access";
import { getMemberProfile } from "@/lib/members/get-member-profile";

export default async function MemberDetailsPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  await requirePortalAccess();
  const { personId: personIdParam } = await params;
  const personId = Number(personIdParam);
  if (!Number.isSafeInteger(personId) || personId <= 0) notFound();

  const profile = await getMemberProfile(personId);
  if (!profile) notFound();

  return (
    <>
      <PortalBreadcrumbData
        labels={{ [`/members/${personId}`]: profile.name }}
      />
      <MemberProfileView {...profile} />
    </>
  );
}
