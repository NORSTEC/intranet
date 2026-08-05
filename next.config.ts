import type { NextConfig } from "next";

// Avatars live in a private bucket and are reached through a signed URL, so
// the optimizer has to be told the one host and prefix they arrive from.
// Everything else stays un-fetchable, which is the point of naming it this
// narrowly rather than allowing the whole host.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

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
