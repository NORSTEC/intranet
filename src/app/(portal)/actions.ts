"use server";

import { revalidatePath } from "next/cache";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Puts the approval card away for good. Nothing is lost with it — the decision
 * and its note stay on the request, and in the audit log.
 */
export async function dismissAccessWelcome(requestId: number) {
  await requirePortalAccess();

  if (!Number.isSafeInteger(requestId) || requestId <= 0) return;

  const supabase = await createClient();
  await supabase.rpc("acknowledge_own_access_decision", {
    p_request_id: requestId,
  });

  revalidatePath("/");
}
