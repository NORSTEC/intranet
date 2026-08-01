import "server-only";

import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

export async function getMemberAvatarUrls(paths: Array<string | null>) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];

  if (uniquePaths.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createClient();
  const signedUrls = await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("member-avatars")
        .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);

      return [path, error ? null : data.signedUrl] as const;
    }),
  );

  return new Map(
    signedUrls.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}
