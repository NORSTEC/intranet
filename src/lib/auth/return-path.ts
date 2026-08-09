const PORTAL_ORIGIN = "https://portal.invalid";

export function safePortalReturnPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }

  try {
    const url = new URL(value, PORTAL_ORIGIN);
    const normalizedPathname = url.pathname.replace(/\/+$/, "") || "/";
    if (
      url.origin !== PORTAL_ORIGIN ||
      url.pathname.startsWith("//") ||
      normalizedPathname === "/profile/security"
    ) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
