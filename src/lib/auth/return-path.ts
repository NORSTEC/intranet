const PORTAL_ORIGIN = "https://portal.invalid";

export function safePortalReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, PORTAL_ORIGIN);
    if (url.origin !== PORTAL_ORIGIN || url.pathname === "/profile/security") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
