"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createNewPortalProfile() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_own_organization_onboarding");

  if (error) {
    redirect("/onboarding/account?error=complete_failed");
  }

  redirect("/");
}
