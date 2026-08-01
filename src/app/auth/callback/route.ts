import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login?error=oauth_callback", requestUrl.origin));
  }

  const { data: account, error: accountError } = await supabase
    .from("portal_accounts")
    .select("person_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountError || !account) {
    return NextResponse.redirect(new URL("/login?error=authorization", requestUrl.origin));
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("person_id", account.person_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.redirect(new URL("/login?error=authorization", requestUrl.origin));
  }

  return NextResponse.redirect(
    new URL(membership ? "/" : "/access", requestUrl.origin),
  );
}
