import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LINK_COOKIE = "portal-account-link";

function errorDestination(origin: string, mode: string, reason: string) {
  const path = mode === "use_existing" ? "/onboarding/account" : "/profile";
  return new URL(`${path}?accountLinkError=${reason}`, origin);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode") === "use_existing"
    ? "use_existing"
    : "add_account";
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error: intentError } = await supabase.rpc("start_portal_account_link", {
    p_mode: mode,
    p_token_hash: tokenHash,
  });

  if (intentError) {
    const reason = intentError.message.includes("too_many_portal_accounts")
      ? "limit"
      : "start";
    return NextResponse.redirect(
      errorDestination(requestUrl.origin, mode, reason),
    );
  }

  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/auth/account-link/callback", requestUrl.origin).toString(),
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });

  if (oauthError || !data.url) {
    return NextResponse.redirect(
      errorDestination(requestUrl.origin, mode, "oauth"),
    );
  }

  const response = NextResponse.redirect(data.url);
  response.cookies.set(LINK_COOKIE, `${mode}.${token}`, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/auth/account-link",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
