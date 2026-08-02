"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function requestId(formData: FormData) {
  const value = Number(formData.get("requestId"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function decision(formData: FormData) {
  const value = formData.get("decision");
  return value === "approved" || value === "rejected" ? value : null;
}

async function review(formData: FormData) {
  await requireOrganizationAdminAccess();
  const id = requestId(formData);
  const nextStatus = decision(formData);
  if (!id || !nextStatus) redirect("/administration/access-requests?error=invalid_request");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_access_request", {
    p_decision: nextStatus,
    p_decision_note: null,
    p_request_id: id,
  });

  if (error) redirect("/administration/access-requests?error=review_failed");
  revalidatePath("/administration/access-requests");
  revalidatePath("/members");
  redirect(`/administration/access-requests?reviewed=${nextStatus}`);
}

export async function reviewAccessRequest(formData: FormData) {
  return review(formData);
}
