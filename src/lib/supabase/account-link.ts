import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

const FLOW_COOKIE = "portal-account-link-flow";
const FLOW_COOKIE_PATH = "/auth/account-link";

// Account linking signs in as a second Google account. Exchanging that code
// with the ordinary server client wrote the new account's session straight
// into the browser's auth cookies, which replaced the session the user was
// already working in: every failed link had to end in a forced sign-out, and
// anyone who could get a victim to open a crafted callback URL could swap the
// victim's session for their own. This client keeps the link session entirely
// in server memory instead. Only the PKCE code verifier is allowed to survive
// the redirect to Google, in a cookie of its own.
export async function createAccountLinkClient() {
  const cookieStore = await cookies();
  const store = new Map<string, string>();
  const storedFlow = cookieStore.get(FLOW_COOKIE)?.value;

  if (storedFlow) {
    try {
      const parsed: unknown = JSON.parse(storedFlow);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [name, value] of Object.entries(parsed)) {
          if (typeof value === "string") store.set(name, value);
        }
      }
    } catch {
      // A malformed flow cookie only means the link cannot be completed.
    }
  }

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return [...store].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            if (value) {
              store.set(name, value);
            } else {
              store.delete(name);
            }
          }
        },
      },
    },
  );

  return { client, store };
}

// An allowlist, not a filter: session tokens must never reach the browser
// from this flow, so anything that is not the PKCE verifier is dropped.
export function accountLinkFlowCookie(store: Map<string, string>) {
  const verifier: Record<string, string> = {};

  for (const [name, value] of store) {
    if (name.endsWith("-code-verifier")) verifier[name] = value;
  }

  return {
    name: FLOW_COOKIE,
    options: {
      httpOnly: true,
      maxAge: 10 * 60,
      path: FLOW_COOKIE_PATH,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    },
    value: JSON.stringify(verifier),
  };
}

export { FLOW_COOKIE as ACCOUNT_LINK_FLOW_COOKIE };
