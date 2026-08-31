import type { MetadataRoute } from "next";

/**
 * Nothing here is meant to be found from a search engine. Everything behind
 * sign-in is unreachable to a crawler anyway, but the pages in front of it —
 * the sign-in page, the access request form, the legal notices — do render for
 * anyone, and an indexed sign-in page invites traffic that has no business
 * arriving.
 *
 * This asks rather than enforces. It is not access control, and it is not
 * relied on as any.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
