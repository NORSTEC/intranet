"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createNewPortalProfile() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "complete_own_organization_onboarding",
  );

  if (error) {
    redirect("/onboarding/account?error=complete_failed");
  }

  // Finishing onboarding no longer implies a membership. Whether it produced
  // one depends on the organization's join policy, and on whether this person
  // was a member there before, so the answer comes back with the call rather
  // than being assumed here.
  const result = (data ?? {}) as {
    organizationSlug?: string;
    outcome?: string;
    returning?: boolean;
  };

  if (result.outcome === "joined" || result.outcome === "member") {
    redirect("/");
  }

  const destination = new URLSearchParams();
  if (result.outcome === "request" && result.organizationSlug) {
    destination.set("organization", result.organizationSlug);
    if (result.returning) destination.set("returning", "true");
  }

  const query = destination.toString();
  redirect(query ? `/access?${query}` : "/access");
}
