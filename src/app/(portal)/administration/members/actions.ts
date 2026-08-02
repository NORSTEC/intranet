"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export type MemberStatusActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function changeMemberStatus(input: {
  membershipId: number;
  organizationSlug: string;
  status: "active" | "ended";
}): Promise<MemberStatusActionResult> {
  const access = await requireOrganizationAdminAccess();
  const allowedOrganization = access.administeredOrganizations.some(
    (membership) => membership.organizationSlug === input.organizationSlug,
  );

  if (
    !allowedOrganization ||
    !Number.isSafeInteger(input.membershipId) ||
    input.membershipId <= 0 ||
    (input.status !== "active" && input.status !== "ended")
  ) {
    return { ok: false, message: "The membership could not be updated." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organization_membership_status", {
    p_membership_id: input.membershipId,
    p_status: input.status,
  });

  if (error) {
    const message = error.message.includes("membership_email_required")
      ? "Add an email address before reactivating this member."
      : error.message.includes("last_organization_admin")
        ? "Assign another organization admin before ending this membership."
        : "The membership could not be updated.";
    return { ok: false, message };
  }

  revalidatePath(`/administration/members/${input.organizationSlug}`);
  revalidatePath("/members");
  return {
    ok: true,
    message: input.status === "active" ? "Membership reactivated." : "Membership ended.",
  };
}
