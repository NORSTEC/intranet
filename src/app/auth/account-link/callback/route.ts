import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCOUNT_LINK_FLOW_COOKIE,
  createAccountLinkClient,
} from "@/lib/supabase/account-link";

const LINK_COOKIE = "portal-account-link";
const LINK_COOKIE_PATH = "/auth/account-link";

function destination(origin: string, mode: string, params: string) {
  const path = mode === "use_existing" ? "/onboarding/account" : "/profile";
  return new URL(`${path}?${params}`, origin);
}

// Path-scoped cookies are only replaced by a write on the same path, so both
// have to be expired explicitly rather than deleted by name alone.
function endLinkFlow(response: NextResponse) {
  for (const name of [LINK_COOKIE, ACCOUNT_LINK_FLOW_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: LINK_COOKIE_PATH,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
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

  if (oauthError || !code || !token) {
    return endLinkFlow(
      NextResponse.redirect(
        destination(requestUrl.origin, mode, "accountLinkError=oauth"),
      ),
    );
  }

  // The exchanged session lives only in this client's memory. Nothing about
  // it is written back to the browser, so the session the user already holds
  // survives both a successful link and every failure below.
  const { client: linkClient } = await createAccountLinkClient();
  const { error: exchangeError } = await linkClient.auth.exchangeCodeForSession(
    code,
  );
  if (exchangeError) {
    return endLinkFlow(
      NextResponse.redirect(
        destination(requestUrl.origin, mode, "accountLinkError=oauth"),
      ),
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error: linkError } = await linkClient.rpc(
    "complete_portal_account_link",
    { p_token_hash: tokenHash },
  );

  if (linkError) {
    const reason = linkError.message.includes("same_portal_account")
      ? "same"
      : linkError.message.includes("source_profile_has_data")
        ? "profile_has_data"
        : linkError.message.includes("source_portal_access_required")
          ? "source_inactive"
          : linkError.message.includes("too_many_portal_accounts")
            ? "limit"
            : linkError.message.includes("expired")
              ? "expired"
              : "merge";

    return endLinkFlow(
      NextResponse.redirect(
        destination(requestUrl.origin, mode, `accountLinkError=${reason}`),
      ),
    );
  }

  return endLinkFlow(
    NextResponse.redirect(
      new URL("/profile?accountLinked=true", requestUrl.origin),
    ),
  );
}
