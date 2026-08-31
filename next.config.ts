import type { NextConfig } from "next";

// Avatars live in a private bucket and are reached through a signed URL, so
// the optimizer has to be told the one host and prefix they arrive from.
// Everything else stays un-fetchable, which is the point of naming it this
// narrowly rather than allowing the whole host.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;
const securityHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          // `includeSubDomains` binds every subdomain of the host this is
          // served from, for a year, with no way to shorten it from the
          // browser's side. That is safe while the intranet has a host of its
          // own — nothing lives under it. Moving it to an apex domain would
          // extend the promise to every sibling service, so check what else
          // answers there before that move, not after.
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Optimized renditions are keyed by source URL, and a signature rotates
    // hourly, so holding them longer than that only caches what nothing will
    // ask for again.
    minimumCacheTTL: 60 * 60,
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/sign/member-avatars/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Files under public/ are revalidated on every load by default, which
        // for a font nobody edits is a round trip spent confirming what the
        // browser already has. The name is the version: a different font has
        // to arrive under a different file name.
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
