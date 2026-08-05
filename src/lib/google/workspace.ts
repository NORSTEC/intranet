import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

/**
 * The slice of the Google Admin SDK Directory API the portal uses: read the
 * directory, and suspend or reactivate one account. It creates nothing and
 * deletes nothing. Workspace accounts are made in the Admin console and the
 * person then signs in, which is what the portal turns into a profile — a
 * second place to create them would have been a second thing to keep correct,
 * and a write permission the portal has no other use for.
 *
 * Authentication holds no credential at all. Vercel signs a short-lived OIDC
 * token for this deployment, Google's Security Token Service exchanges it for
 * a federated token, and that impersonates the service account carrying the
 * Admin console role. Nothing is downloaded, nothing is stored, and the trust
 * is scoped to one Vercel project and one environment — a preview deployment
 * of a branch is a different subject and reaches nothing.
 *
 * `ExternalAccountClient` performs that exchange and its refresh. This is the
 * one place the no-dependency preference elsewhere in this codebase gives way:
 * a hand-rolled credential exchange is the wrong thing to maintain.
 */

const DIRECTORY = "https://admin.googleapis.com/admin/directory/v1";
const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  // Suspending is the one write. The full user scope is required for it;
  // Google has no narrower one.
  "https://www.googleapis.com/auth/admin.directory.user",
];

export class WorkspaceError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "WorkspaceError";
    this.status = status;
  }
}

export type WorkspaceUser = {
  displayName: string | null;
  id: string;
  primaryEmail: string;
  suspended: boolean;
};

type WorkspaceConfig = {
  audience: string;
  domain: string;
  serviceAccountEmail: string;
};

function readConfig(): WorkspaceConfig | null {
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;

  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail || !domain) {
    return null;
  }

  return {
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    domain: domain.toLocaleLowerCase("en"),
    serviceAccountEmail,
  };
}

export function isWorkspaceConfigured() {
  return readConfig() !== null;
}

export function workspaceDomain() {
  return readConfig()?.domain ?? null;
}

function requireConfig() {
  const config = readConfig();
  if (!config) {
    throw new WorkspaceError("workspace_not_configured");
  }
  return config;
}

// Built once per server instance. The client caches and refreshes the
// exchanged token itself; rebuilding it per request would throw that away.
let cachedClient: ReturnType<typeof ExternalAccountClient.fromJSON> | null = null;

function authClient() {
  if (cachedClient) return cachedClient;

  const config = requireConfig();
  const client = ExternalAccountClient.fromJSON({
    audience: config.audience,
    scopes: SCOPES,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    type: "external_account",
  });

  if (!client) {
    throw new WorkspaceError("workspace_not_configured");
  }

  cachedClient = client;
  return client;
}

async function accessToken() {
  try {
    const token = await authClient().getAccessToken();
    if (!token) throw new WorkspaceError("Google returned no access token.");
    return token;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    // A failure here is the federation itself: no Vercel OIDC token outside a
    // deployment, or a trust relationship Google has not been taught. Saying
    // which is more use than the library's own wording.
    throw new WorkspaceError(
      error instanceof Error
        ? `Could not exchange the deployment's identity for Google access: ${error.message}`
        : "Could not exchange the deployment's identity for Google access.",
    );
  }
}

function describeApiError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

async function directoryRequest(
  path: string,
  init: { body?: unknown; method: string },
) {
  const token = await accessToken();
  const response = await fetch(`${DIRECTORY}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method: init.method,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new WorkspaceError(
      describeApiError(payload) ?? `Google returned ${response.status}.`,
      response.status,
    );
  }

  return payload;
}

function toWorkspaceUser(payload: unknown): WorkspaceUser {
  const record = (payload ?? {}) as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const primaryEmail =
    typeof record.primaryEmail === "string" ? record.primaryEmail : null;

  if (!id || !primaryEmail) {
    throw new WorkspaceError("Google returned an unrecognisable user.");
  }

  const name = (record.name ?? {}) as Record<string, unknown>;

  return {
    displayName:
      typeof name.fullName === "string" && name.fullName.length > 0
        ? name.fullName
        : null,
    id,
    primaryEmail: primaryEmail.toLocaleLowerCase("en"),
    suspended: record.suspended === true,
  };
}

/**
 * Looks a Workspace user up by address or by Google id. A missing user is not
 * an error — it is the answer the caller is asking for.
 */
export async function findWorkspaceUser(
  userKey: string,
): Promise<WorkspaceUser | null> {
  try {
    return toWorkspaceUser(
      await directoryRequest(`/users/${encodeURIComponent(userKey)}`, {
        method: "GET",
      }),
    );
  } catch (error) {
    if (error instanceof WorkspaceError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Every user in the domain, suspended ones included — an account nobody has
 * cleaned up is exactly what the reconciliation is looking for. Google pages
 * these, and the page token is followed to the end rather than silently
 * truncating the picture the portal then reports as complete.
 */
export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const config = requireConfig();
  const users: WorkspaceUser[] = [];
  let pageToken: string | null = null;

  do {
    const query = new URLSearchParams({
      domain: config.domain,
      maxResults: "500",
      orderBy: "email",
      projection: "basic",
      showDeleted: "false",
    });
    if (pageToken) query.set("pageToken", pageToken);

    const payload = (await directoryRequest(`/users?${query}`, {
      method: "GET",
    })) as { nextPageToken?: string; users?: unknown[] } | null;

    for (const user of payload?.users ?? []) {
      users.push(toWorkspaceUser(user));
    }

    pageToken = payload?.nextPageToken ?? null;
  } while (pageToken);

  return users;
}

/**
 * Suspending is what blocks sign-in everywhere in Google — mail, Drive, and
 * the Google sign-in this portal itself accepts — while leaving every file and
 * message intact. It is the only write the portal makes, and reversing it
 * restores the account exactly as it was.
 */
export async function setWorkspaceUserSuspended(
  userKey: string,
  suspended: boolean,
): Promise<WorkspaceUser> {
  return toWorkspaceUser(
    await directoryRequest(`/users/${encodeURIComponent(userKey)}`, {
      body: { suspended },
      method: "PATCH",
    }),
  );
}

/** The Admin console page for one account, for linking out to. */
export function workspaceAdminUrl(externalId: string) {
  return `https://admin.google.com/ac/users/${encodeURIComponent(externalId)}`;
}
