import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LINK_COOKIE = "portal-account-link";

function destination(origin: string, mode: string, params: string) {
  const path = mode === "use_existing" ? "/onboarding/account" : "/profile";
  return new URL(`${path}?${params}`, origin);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const storedIntent = cookieStore.get(LINK_COOKIE)?.value;
  const separator = storedIntent?.indexOf(".") ?? -1;
  const mode = separator > 0 ? storedIntent!.slice(0, separator) : "add_account";
  const token = separator > 0 ? storedIntent!.slice(separator + 1) : null;
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");

  cookieStore.delete(LINK_COOKIE);

  if (oauthError || !code || !token) {
    return NextResponse.redirect(destination(requestUrl.origin, mode, "accountLinkError=oauth"));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(destination(requestUrl.origin, mode, "accountLinkError=oauth"));
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error: linkError } = await supabase.rpc("complete_portal_account_link", {
    p_token_hash: tokenHash,
  });

  if (linkError) {
    const reason = linkError.message.includes("same_portal_account")
      ? "same"
      : linkError.message.includes("source_profile_has_data")
        ? "profile_has_data"
        : linkError.message.includes("too_many_portal_accounts")
          ? "limit"
          : linkError.message.includes("expired")
            ? "expired"
            : "merge";
    if (mode === "add_account") {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(`/login?error=account_link&reason=${reason}`, requestUrl.origin),
      );
    }

    return NextResponse.redirect(
      new URL(`/profile?accountLinkError=${reason}`, requestUrl.origin),
    );
  }

  return NextResponse.redirect(
    new URL("/profile?accountLinked=true", requestUrl.origin),
  );
}
