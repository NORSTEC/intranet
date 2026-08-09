import { type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/security/content-security-policy";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy({
    development: process.env.NODE_ENV !== "production",
    nonce,
    supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "",
  });
  const requestHeaders = new Headers(request.headers);

  // These values are overwritten at the trusted request boundary. Pages can
  // read them, while a caller cannot choose either a script nonce or a redirect
  // target by sending their own headers.
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "x-portal-pathname",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Every match costs a Supabase token revalidation, so keep framework
  // internals (chunks, HMR, RSC prefetch payloads) and static assets out.
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|json|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
