import { getVercelOidcToken } from "@vercel/oidc";

/**
 * The slice of the Slack Web API the portal uses: read the member list, and
 * read the workspace's own name so a row can link back to Slack. Every method
 * here is a read. There is deliberately no invite, no removal, and no
 * deactivation — the portal is not in use yet, and until it is, nothing it does
 * may change the real workspace.
 *
 * That is not only caution. On Slack Pro, deactivating a member is not
 * available over the API at all: `admin.users.*` and SCIM are Business+ and
 * Enterprise Grid features. So the Slack side of the portal is a report, not
 * the two-way mirror the Google Workspace side is. An administrator reads the
 * report and acts in Slack, and the next sync sees what they did.
 *
 * Authentication holds no credential. Vercel signs a short-lived OIDC token for
 * this deployment, Vercel Connect exchanges it for a Slack token, and the Slack
 * OAuth grant itself lives with Vercel rather than in this repository or in an
 * environment variable. This is the same shape the Google Workspace client
 * uses, for the same reason: a static bot token would sit in `process.env` for
 * every dependency in the tree to read, and nothing would ever rotate it.
 *
 * The exchange is one POST, so it is written out here rather than pulling in
 * `@vercel/connect` for it — unlike Google's STS flow, there is no signing,
 * no refresh protocol and no credential file to get wrong.
 */

const SLACK_API = "https://slack.com/api";
const CONNECT_TOKEN_URL = "https://api.vercel.com/v1/connect/token";

// Slack answers a page at a time. 200 is what Slack's own documentation
// recommends over the maximum: `users.list` is a Tier 2 method, and asking for
// more per call is what makes a page time out rather than what makes the sync
// faster.
const PAGE_SIZE = 200;

export class SlackError extends Error {
  /** Slack's own error code, e.g. `missing_scope`. Null for transport failures. */
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "SlackError";
    this.code = code;
  }
}

/**
 * Single-channel guests are free on Slack Pro; multi-channel guests take a
 * paid seat like a full member. Alumni are the obvious future population of
 * both, so which kind somebody is has a cost attached and is worth reporting
 * rather than flattening into one "guest" flag.
 */
export type SlackGuestType = "multi_channel" | "single_channel";

/** Who can administer the workspace. Owners can do everything admins can. */
export type SlackWorkspaceRole = "admin" | "member" | "owner";

export type SlackUser = {
  /**
   * Null when Slack has no address for the account. That is a real state — a
   * guest invited by phone, or an account created before the workspace
   * required one — and the row is still worth reporting, so it is imported
   * unmatched rather than dropped.
   */
  accountEmail: string | null;
  /** Slack's `deleted`, which means deactivated. The account still exists. */
  deactivated: boolean;
  displayName: string | null;
  guestType: SlackGuestType | null;
  /** The `@name` people refer to each other by, which is not the address. */
  handle: string | null;
  /** Slack's immutable user id, `U…`. Display names and addresses change. */
  id: string;
  workspaceRole: SlackWorkspaceRole;
};

function readConnector() {
  return process.env.SLACK_CONNECT_CONNECTOR ?? null;
}

export function isSlackConfigured() {
  return readConnector() !== null;
}

function requireConnector() {
  const connector = readConnector();
  if (!connector) {
    throw new SlackError("slack_not_configured");
  }
  return connector;
}

// Connector ids carry a slash — `slack/norstec-portal` — and both halves are
// path segments Vercel expects to read back. Encoding the whole string would
// turn the separator into `%2F` and address a connector that does not exist.
function connectorPath(connector: string) {
  return connector.split("/").map(encodeURIComponent).join("/");
}

let cachedToken: { expiresAt: number; token: string } | null = null;

// Vercel has returned `expiresAt` as both an ISO timestamp and epoch
// milliseconds across versions of this API. Reading either is three lines;
// caching a token past its life produces a `not_authed` an hour later that
// looks like a broken Slack app.
function expiryFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  // No usable expiry means no caching, rather than a guess that outlives the
  // token.
  return 0;
}

async function accessToken() {
  const connector = requireConnector();

  // A minute of margin, so a token that is about to expire is not handed to a
  // sync that then spends several page requests using it.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  let oidcToken: string;
  try {
    oidcToken = await getVercelOidcToken();
  } catch (error) {
    // There is no Vercel OIDC token outside a deployment, which is the failure
    // somebody running this locally will hit. Saying so is more use than the
    // library's own wording.
    throw new SlackError(
      error instanceof Error
        ? `No Vercel deployment identity to exchange for Slack access: ${error.message}`
        : "No Vercel deployment identity to exchange for Slack access.",
    );
  }

  const response = await fetch(
    `${CONNECT_TOKEN_URL}/${connectorPath(connector)}`,
    {
      // The bot acts as the app, not on behalf of the administrator who pressed
      // sync. A user-scoped token would read the directory through whatever
      // that one person can see, and would stop working the day they leave.
      body: JSON.stringify({ subject: { type: "app" } }),
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: { message?: unknown } }).error?.message ===
        "string"
        ? ((payload as { error: { message: string } }).error.message)
        : `Vercel Connect returned ${response.status}.`;
    throw new SlackError(
      `Could not exchange the deployment's identity for Slack access: ${message}`,
    );
  }

  const token = (payload as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new SlackError("Vercel Connect returned no Slack token.");
  }

  cachedToken = {
    expiresAt: expiryFrom((payload as { expiresAt?: unknown }).expiresAt),
    token,
  };

  return token;
}

/**
 * Slack answers a refused request with HTTP 200 and `{ ok: false }`, so the
 * status code alone never tells you anything went wrong. The body is the
 * authority, and `error` is what names the missing scope.
 */
async function slackRequest(
  method: string,
  params: Record<string, string> = {},
  attempt = 0,
): Promise<Record<string, unknown>> {
  const token = await accessToken();
  const query = new URLSearchParams(params);

  const response = await fetch(`${SLACK_API}/${method}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  });

  // Tier 2 methods are rate limited per workspace, and a sync of a large
  // workspace is exactly the thing that trips one. Slack says how long to wait;
  // one retry turns a failed sync into a slow one.
  if (response.status === 429 && attempt === 0) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 30) * 1000),
    );
    return slackRequest(method, params, attempt + 1);
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!payload) {
    throw new SlackError(`Slack returned an unreadable ${response.status}.`);
  }

  if (payload.ok !== true) {
    const code = typeof payload.error === "string" ? payload.error : null;
    throw new SlackError(code ?? "Slack refused the request.", code);
  }

  return payload;
}

function toSlackUser(payload: unknown): SlackUser | null {
  const record = (payload ?? {}) as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;

  // Apps, bots and Slackbot are not people and never match anybody in the
  // portal. Leaving them in would fill the unmatched report — the one table
  // whose whole value is that everything in it deserves a look — with rows
  // nobody can ever act on.
  if (record.is_bot === true || record.is_app_user === true) return null;
  if (id === "USLACKBOT") return null;

  const profile = (record.profile ?? {}) as Record<string, unknown>;
  const email =
    typeof profile.email === "string" && profile.email.length > 0
      ? profile.email.toLocaleLowerCase("en")
      : null;

  // Deliberately not falling back to `record.name`: that is the @handle, which
  // is now reported on its own. Falling back would print it twice on a row
  // whose owner never set a real name.
  const realName =
    typeof profile.real_name === "string" && profile.real_name.length > 0
      ? profile.real_name
      : typeof record.real_name === "string" && record.real_name.length > 0
        ? record.real_name
        : null;

  return {
    accountEmail: email,
    // Slack's `deleted` is a deactivation, not a deletion: the account and
    // everything it wrote stay in the workspace. It is the closest thing Slack
    // has to a suspended Workspace account.
    deactivated: record.deleted === true,
    displayName: realName,
    // Checked in this order because `is_ultra_restricted` implies
    // `is_restricted` — a single-channel guest is a restricted account too, so
    // testing the broader flag first would report every one of them as
    // multi-channel.
    guestType:
      record.is_ultra_restricted === true
        ? "single_channel"
        : record.is_restricted === true
          ? "multi_channel"
          : null,
    handle: typeof record.name === "string" && record.name.length > 0
      ? record.name
      : null,
    id,
    // The primary owner is an owner with one extra power nothing here acts on,
    // so the two are reported as the same thing.
    workspaceRole:
      record.is_owner === true || record.is_primary_owner === true
        ? "owner"
        : record.is_admin === true
          ? "admin"
          : "member",
  };
}

/**
 * Every member of the workspace, deactivated ones included — an account nobody
 * has cleaned up is exactly what the report is looking for. Slack pages these,
 * and the cursor is followed to the end rather than silently truncating the
 * picture the portal then presents as complete.
 */
export async function listSlackUsers(): Promise<SlackUser[]> {
  const users: SlackUser[] = [];
  let cursor = "";

  do {
    const params: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (cursor) params.cursor = cursor;

    const payload = await slackRequest("users.list", params);

    for (const member of (payload.members as unknown[] | undefined) ?? []) {
      const user = toSlackUser(member);
      if (user) users.push(user);
    }

    const metadata = (payload.response_metadata ?? {}) as Record<
      string,
      unknown
    >;
    cursor =
      typeof metadata.next_cursor === "string" ? metadata.next_cursor : "";
  } while (cursor);

  return users;
}

let cachedDomain: string | null = null;

/**
 * The workspace's Slack subdomain, which is the only part of a profile link
 * the portal cannot derive from a user id. Read from Slack rather than kept in
 * the environment: it is one call, it is cached for the life of the server
 * instance, and it is one fewer setting to get wrong.
 */
export async function slackTeamDomain(): Promise<string | null> {
  if (cachedDomain) return cachedDomain;

  const payload = await slackRequest("team.info");
  const team = (payload.team ?? {}) as Record<string, unknown>;
  const domain = typeof team.domain === "string" ? team.domain : null;

  if (domain) cachedDomain = domain;
  return domain;
}

/** The Slack profile for one account, for linking out to. */
export function slackProfileUrl(domain: string, userId: string) {
  return `https://${domain}.slack.com/team/${encodeURIComponent(userId)}`;
}
