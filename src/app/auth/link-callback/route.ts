import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError || !code) {
    return NextResponse.redirect(
      new URL("/profile?accountLinkError=oauth", requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      new URL("/profile?accountLinkError=oauth", requestUrl.origin),
    );
  }

  const { error: syncError } = await supabase.rpc("sync_linked_google_identities");

  if (syncError) {
    const reason = syncError.message.includes("identity_email_belongs_to_another_profile")
      ? "conflict"
      : "sync";
    return NextResponse.redirect(
      new URL(`/profile?accountLinkError=${reason}`, requestUrl.origin),
    );
  }

  return NextResponse.redirect(
    new URL("/profile?accountLinked=true", requestUrl.origin),
  );
}
