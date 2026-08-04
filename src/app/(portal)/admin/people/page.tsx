import { PortalPeopleRegistry } from "@/components/portal/portal-people-registry";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadRegistryPeople } from "@/lib/portal/people-registry";

export default async function ManageUsersPage() {
  const access = await requirePortalAdminAccess();
  const people = await loadRegistryPeople();
  // A user is someone who belongs, or once belonged, to an organization.
  // Profiles created by a Google sign-in that never led to a membership stay
  // in Access review instead. Portal administrators are always listed, even
  // in the rare case that they hold no membership of their own — and so are
  // alumni granted portal access directly, whose approval creates no
  // membership row at all.
  const users = people.filter(
    (person) =>
      !person.isDeleted &&
      (person.hasMembership || person.isPortalAdmin || person.hasAlumniAccess),
  );

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Click the user you want to administer.
      </p>

      <PortalPeopleRegistry
        currentPersonId={access.profile.personId}
        people={users}
      />
    </>
  );
}
