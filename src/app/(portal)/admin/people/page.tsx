import { PortalPeopleRegistry } from "@/components/portal/portal-people-registry";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadRegistryPeople } from "@/lib/portal/people-registry";

export default async function ManagePeoplePage() {
  const access = await requirePortalAdminAccess();
  const people = await loadRegistryPeople();
  // Listed here is whoever belongs, or once belonged, to an organization.
  // Someone a Google sign-in created who never reached a membership stays in
  // Access review instead. Portal administrators are always listed, even in
  // the rare case that they hold no membership of their own — and so are
  // alumni granted portal access directly, whose approval creates no
  // membership row at all.
  const administrable = people.filter(
    (person) =>
      !person.isDeleted &&
      (person.hasMembership || person.isPortalAdmin || person.hasAlumniAccess),
  );

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Click the person you want to administer.
      </p>

      <PortalPeopleRegistry
        currentPersonId={access.profile.personId}
        people={administrable}
      />
    </>
  );
}
