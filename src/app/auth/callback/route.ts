import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PersonAccess = {
  alumni_access_granted_at: string | null;
  portal_access_status: string;
};

type LinkedAccount = {
  onboarding_status: "pending" | "complete";
  person_id: number;
  people: PersonAccess | PersonAccess[];
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
    .select(
      "person_id, onboarding_status, people (portal_access_status, alumni_access_granted_at)",
    )
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
    // A deleted person cannot read their own row, so the reason comes from a
    // function rather than from the join above.
    const { data: blockReason } = await supabase.rpc("sign_in_block_reason");
    await supabase.auth.signOut();
    const reason =
      blockReason === "deleted" || blockReason === "suspended"
        ? blockReason
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

  // An approved alumnus holds portal access without any membership row, so
  // sending them to /access would only bounce them straight back to the portal.
  const hasPortalAccess = Boolean(membership) || Boolean(person.alumni_access_granted_at);

  return NextResponse.redirect(
    new URL(hasPortalAccess ? "/" : "/access", requestUrl.origin),
  );
}
