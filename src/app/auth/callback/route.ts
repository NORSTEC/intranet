import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type LinkedAccount = {
  onboarding_status: "pending" | "complete";
  person_id: number;
  people:
    | { portal_access_status: string }
    | Array<{ portal_access_status: string }>;
};

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
    .select("person_id, onboarding_status, people (portal_access_status)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountError || !account) {
    return NextResponse.redirect(new URL("/login?error=authorization", requestUrl.origin));
  }

  const linkedAccount = account as LinkedAccount;
  const person = Array.isArray(linkedAccount.people)
    ? linkedAccount.people[0]
    : linkedAccount.people;
  if (!person || person.portal_access_status !== "active") {
    await supabase.auth.signOut();
    const reason = person?.portal_access_status === "deactivated"
      ? "deactivated"
      : person?.portal_access_status === "suspended"
        ? "suspended"
        : "authorization";
    return NextResponse.redirect(new URL(`/login?error=${reason}`, requestUrl.origin));
  }

  if (linkedAccount.onboarding_status === "pending") {
    return NextResponse.redirect(new URL("/onboarding/account", requestUrl.origin));
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("person_id", linkedAccount.person_id)
    .in("status", ["active", "ended"])
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.redirect(new URL("/login?error=authorization", requestUrl.origin));
  }

  return NextResponse.redirect(
    new URL(membership ? "/" : "/access", requestUrl.origin),
  );
}
