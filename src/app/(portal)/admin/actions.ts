"use server";

import { revalidatePath } from "next/cache";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export type PortalManagementResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const portalAccessStatuses = ["active", "suspended"] as const;

export type PortalAccessStatus = (typeof portalAccessStatuses)[number];

const membershipRoles = ["member", "organization_admin"] as const;

export type MembershipRole = (typeof membershipRoles)[number];

function isValidPersonId(personId: number) {
  return Number.isSafeInteger(personId) && personId > 0;
}

function revalidatePersonViews(personId: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/people");
  revalidatePath("/admin/deleted");
  revalidatePath(`/admin/people/${personId}`);
  revalidatePath("/members");
}

function messageFor(error: { message: string }, fallback: string) {
  if (error.message.includes("not_authorized")) {
    return "You are not a portal administrator.";
  }
  if (error.message.includes("self_action_blocked")) {
    return "You cannot run this on your own profile. Ask another portal administrator.";
  }
  if (error.message.includes("person_not_found")) {
    return "This person no longer exists.";
  }
  if (error.message.includes("person_already_deleted")) {
    return "This person is already deleted.";
  }
  if (error.message.includes("person_not_deleted")) {
    return "This person is not deleted.";
  }
  if (error.message.includes("person_deleted")) {
    return "This person is deleted. Restore them first.";
  }
  if (error.message.includes("person_never_claimed")) {
    return "This profile has never been signed in to, so there is no access to activate.";
  }
  if (error.message.includes("portal_admin_role_first")) {
    return "Remove the portal administrator role first.";
  }
  if (error.message.includes("last_portal_admin")) {
    return "The portal must keep at least one administrator.";
  }
  if (error.message.includes("portal_access_required")) {
    return "Only someone with active portal access can administer the portal.";
  }
  if (error.message.includes("norstec_domain_required")) {
    return "Only people with a norstec.no email or linked Google account can become portal administrators.";
  }
  if (error.message.includes("last_organization_admin")) {
    return "This person is the last active administrator of an organization. Appoint another administrator first.";
  }
  if (error.message.includes("membership_not_active")) {
    return "This membership has ended. Reactivate it before changing the role.";
  }
  if (error.message.includes("membership_not_found")) {
    return "This membership no longer exists.";
  }
  if (error.message.includes("purge_conflict")) {
    return "This deletion changed while the page was open. Reload and try again.";
  }
  if (error.message.includes("too_many_portal_accounts")) {
    return "Together these profiles hold more than two sign-in accounts. Unlink one first.";
  }
  if (error.message.includes("primary_email_not_found")) {
    return "The chosen primary address does not belong to either profile.";
  }
  if (error.message.includes("same_person")) {
    return "Pick two different people.";
  }
  return fallback;
}

export async function changePortalAccess(input: {
  personId: number;
  status: PortalAccessStatus;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.personId) ||
    !portalAccessStatuses.includes(input.status)
  ) {
    return { ok: false, message: "Portal access could not be changed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_person_portal_access", {
    p_person_id: input.personId,
    p_status: input.status,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "Portal access could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);
  return {
    ok: true,
    message:
      input.status === "active"
        ? "Portal access restored."
        : "Portal access suspended. Open sessions were signed out.",
  };
}

export async function changePortalAdministrator(input: {
  isAdministrator: boolean;
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId)) {
    return { ok: false, message: "The administrator role could not be changed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_portal_administrator", {
    p_is_administrator: input.isAdministrator,
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The administrator role could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);
  return {
    ok: true,
    message: input.isAdministrator
      ? "Portal administrator role granted."
      : "Portal administrator role revoked.",
  };
}

export async function setMembershipRole(input: {
  membershipId: number;
  personId: number;
  role: MembershipRole;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.membershipId) ||
    !membershipRoles.includes(input.role)
  ) {
    return { ok: false, message: "The organization role could not be changed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_role", {
    p_membership_id: input.membershipId,
    p_role: input.role,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The organization role could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);
  // The role decides who may administer an organization, so every page that
  // reads it — not just the portal-management views — is now stale.
  revalidatePath("/administration", "layout");
  revalidatePath("/organizations", "layout");
  return {
    ok: true,
    message:
      input.role === "organization_admin"
        ? "Organization administrator role granted."
        : "Organization administrator role revoked.",
  };
}

export async function softDeletePerson(input: {
  personId: number;
  reason: string;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();
  const reason = input.reason.trim();

  if (!isValidPersonId(input.personId) || reason.length > 500) {
    return { ok: false, message: "This person could not be deleted." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_person", {
    p_person_id: input.personId,
    p_reason: reason || null,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be deleted."),
    };
  }

  revalidatePersonViews(input.personId);
  return {
    ok: true,
    message:
      "Person deleted. Their memberships ended, and their data is erased permanently after 30 days.",
  };
}

export async function restorePerson(input: {
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId)) {
    return { ok: false, message: "This person could not be restored." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_person", {
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be restored."),
    };
  }

  revalidatePersonViews(input.personId);
  return { ok: true, message: "Person restored." };
}

export async function purgePerson(input: {
  deletedAt: string;
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId) || !input.deletedAt) {
    return { ok: false, message: "This person could not be purged." };
  }

  const supabase = await createClient();
  const { data: avatarPath, error } = await supabase.rpc("purge_person", {
    p_expected_deleted_at: input.deletedAt,
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be purged."),
    };
  }

  // Storage lives outside the database, so the avatar object survives the
  // cascade and has to be removed on its own. A failure here leaves an
  // orphaned file, not a half-purged person.
  if (avatarPath) {
    await supabase.storage.from("member-avatars").remove([avatarPath]);
  }

  revalidatePersonViews(input.personId);
  return { ok: true, message: "Person purged. This cannot be undone." };
}

export async function mergePeople(input: {
  primaryEmail: string | null;
  sourcePersonId: number;
  targetPersonId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.targetPersonId) ||
    !isValidPersonId(input.sourcePersonId)
  ) {
    return { ok: false, message: "These profiles could not be merged." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_people", {
    p_primary_email: input.primaryEmail,
    p_source_person_id: input.sourcePersonId,
    p_target_person_id: input.targetPersonId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "These profiles could not be merged."),
    };
  }

  revalidatePersonViews(input.targetPersonId);
  revalidatePath(`/admin/people/${input.sourcePersonId}`);
  return { ok: true, message: "Profiles merged." };
}
