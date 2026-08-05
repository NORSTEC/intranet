import "server-only";

import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

// A signature is reused until it is close enough to expiry that a page built
// with it could outlive it. Reuse is the whole point: a fresh signature is a
// fresh URL, and a fresh URL is a picture the browser has never seen before,
// so every navigation used to re-download every avatar. The lifetime itself is
// unchanged, so a URL that escapes is no longer valid than it ever was.
const REUSE_MARGIN_SECONDS = 10 * 60;

// Enough headroom for a portal-sized directory. The prune below keeps a
// long-running server from holding paths nobody asks for any more.
const MAX_CACHED_PATHS = 1000;

const signedUrlCache = new Map<string, { expiresAt: number; url: string }>();

function prune(now: number) {
  for (const [path, entry] of signedUrlCache) {
    if (entry.expiresAt <= now) signedUrlCache.delete(path);
  }
}

export async function getMemberAvatarUrls(paths: Array<string | null>) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];

  if (uniquePaths.length === 0) {
    return new Map<string, string>();
  }

  const now = Date.now();
  const urls = new Map<string, string>();
  const unsignedPaths: string[] = [];

  for (const path of uniquePaths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > now) urls.set(path, cached.url);
    else unsignedPaths.push(path);
  }

  if (unsignedPaths.length === 0) {
    return urls;
  }

  const supabase = await createClient();
  // One request covering every path, not one request each: a directory of
  // sixty members opened sixty connections before the page could render.
  const { data, error } = await supabase.storage
    .from("member-avatars")
    .createSignedUrls(unsignedPaths, SIGNED_URL_LIFETIME_SECONDS);

  if (error || !data) {
    return urls;
  }

  const expiresAt =
    now + (SIGNED_URL_LIFETIME_SECONDS - REUSE_MARGIN_SECONDS) * 1000;

  for (const entry of data) {
    // A path that fails to sign — a file removed behind our back — is left out
    // exactly as before, so the caller falls back to initials.
    if (entry.error || !entry.path || !entry.signedUrl) continue;
    signedUrlCache.set(entry.path, { expiresAt, url: entry.signedUrl });
    urls.set(entry.path, entry.signedUrl);
  }

  if (signedUrlCache.size > MAX_CACHED_PATHS) prune(now);

  return urls;
}
