import { PortalPeopleRegistry } from "@/components/portal/portal-people-registry";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadRegistryPeople } from "@/lib/portal/people-registry";

export default async function DeletedUsersPage() {
  const access = await requirePortalAdminAccess();
  const people = await loadRegistryPeople();
  const deletedPeople = people.filter((person) => person.isDeleted);

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Deleted users are hidden from everyone except portal administrators.
        Their data is erased permanently 30 days after the deletion, whether or
        not anybody acts on it. Click the user you want to restore, or to purge
        before the 30 days run out.
      </p>

      <PortalPeopleRegistry
        currentPersonId={access.profile.personId}
        emptyMessage="No one has been deleted."
        people={deletedPeople}
        statusOptions={["deleted"]}
      />
    </>
  );
}
