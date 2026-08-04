import { notFound } from "next/navigation";
import { MemberStatusManager } from "@/components/portal/member-status-manager";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type MembershipRow = {
  id: number;
  role: "member" | "organization_admin";
  status: "active" | "ended";
  people:
    | {
        id: number;
        avatar_path: string | null;
        full_name: string | null;
        person_emails: Array<{
          email: string;
          email_type: string;
          is_primary: boolean;
        }>;
      }
    | Array<{
        id: number;
        avatar_path: string | null;
        full_name: string | null;
        person_emails: Array<{
          email: string;
          email_type: string;
          is_primary: boolean;
        }>;
      }>;
};

export default async function OrganizationMemberStatusPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const access = await requireOrganizationAdminAccess();
  const { organizationSlug } = await params;
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!administeredOrganization) notFound();

  const supabase = await createClient();
  const membershipsResult = await supabase
    .from("memberships")
    .select(
      "id, role, status, people!memberships_person_id_fkey (id, full_name, avatar_path, person_emails (email, email_type, is_primary))",
    )
    .eq("organization_id", administeredOrganization.organizationId)
    .in("status", ["active", "ended"])
    .order("status")
    .order("full_name", {
      referencedTable: "people",
      ascending: true,
      nullsFirst: false,
    });

  if (membershipsResult.error) {
    throw new Error("Could not load organization members");
  }

  const membershipRows = membershipsResult.data as MembershipRow[];
  const people = membershipRows.flatMap((membership) => {
    const person = Array.isArray(membership.people)
      ? membership.people[0]
      : membership.people;
    return person ? [person] : [];
  });
  const avatarUrls = await getMemberAvatarUrls(
    people.map((person) => person.avatar_path),
  );

  const members = membershipRows.flatMap((membership) => {
    const person = Array.isArray(membership.people)
      ? membership.people[0]
      : membership.people;
    if (!person) return [];

    const orderedEmails = [...person.person_emails].sort(
      (left, right) =>
        Number(right.is_primary) - Number(left.is_primary) ||
        Number(right.email_type === "organization") -
          Number(left.email_type === "organization"),
    );

    return [
      {
        avatarUrl: person.avatar_path
          ? avatarUrls.get(person.avatar_path)
          : undefined,
        email: orderedEmails[0]?.email ?? null,
        hasPersonalEmail: person.person_emails.some(
          (email) => email.email_type === "personal",
        ),
        membershipId: membership.id,
        name: person.full_name ?? "Unnamed member",
        personId: person.id,
        role: membership.role,
        status: membership.status,
      },
    ];
  });

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/administration/members/${organizationSlug}`]:
            administeredOrganization.organizationName,
        }}
      />
      <MemberStatusManager
        currentPersonId={access.profile.personId}
        members={members}
        organizationName={administeredOrganization.organizationName}
        organizationSlug={organizationSlug}
      />
    </>
  );
}
