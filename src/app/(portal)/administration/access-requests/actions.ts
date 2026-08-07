"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { drainNotifications } from "@/lib/email/notifications";
import { createClient } from "@/lib/supabase/server";

export type ReviewActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function reviewAccessRequest(input: {
  decision: "approved" | "rejected";
  note: string;
  requestId: number;
}): Promise<ReviewActionResult> {
  await requireOrganizationAdminAccess();
  const note = input.note.trim();

  if (
    !Number.isSafeInteger(input.requestId) ||
    input.requestId <= 0 ||
    (input.decision !== "approved" && input.decision !== "rejected") ||
    note.length > 1000
  ) {
    return { ok: false, message: "The request could not be reviewed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_access_request", {
    p_decision: input.decision,
    p_decision_note: note || null,
    p_request_id: input.requestId,
  });

  if (error) {
    const message = error.message.includes("request_not_pending")
      ? "This request has already been decided."
      : error.message.includes("not_authorized")
        ? "You cannot decide this request."
        : "The request could not be reviewed.";
    return { ok: false, message };
  }

  // `review_access_request` queued the applicant's email inside the same
  // transaction as the decision. Sending happens after the response, so a slow
  // or unavailable email service delays nothing the administrator is waiting
  // for — the decision is already committed either way.
  after(() => drainNotifications(supabase));

  revalidatePath("/administration/access-requests");
  revalidatePath("/members");
  revalidatePath("/");
  return {
    ok: true,
    message:
      input.decision === "approved"
        ? "Access granted."
        : "Request declined.",
  };
}
