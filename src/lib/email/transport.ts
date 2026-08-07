/**
 * Sending email, and the one decision that shapes everything under this
 * directory: **outside production, nothing is sent.**
 *
 * The portal's recipients are real members, and their addresses are in the
 * database a developer runs against. A transport that quietly works in
 * development is a transport that mails 300 people the first time somebody
 * runs the wrong test. So the API key lives only in the production
 * environment, and without it {@link sendEmail} writes to the console and
 * reports success — the queue drains, the code path is exercised, and no one
 * is written to.
 *
 * Resend has an SDK. This uses `fetch` instead, for the same reason the rest
 * of this codebase reaches for a dependency only when the alternative is
 * maintaining something genuinely hard: one POST to one endpoint is not that.
 * Sending is deliberately the only thing the key can do — create it with
 * *Sending access*, restricted to the sending domain, and it can neither read
 * what was sent nor manage the account.
 */

const ENDPOINT = "https://api.resend.com/emails";

// The portal is served from `portal.norstec.no` and sends from it too, so the
// address a member is written from matches the address they visit. Sending
// from a subdomain rather than `norstec.no` keeps this reputation separate
// from the Workspace mail real people send, and leaves the root domain's
// existing SPF record alone.
const DEFAULT_FROM = "NORSTEC Portal <noreply@portal.norstec.no>";

export type EmailMessage = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

export class EmailError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "EmailError";
    this.status = status;
  }
}

type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | null;
};

function readConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    from: process.env.PORTAL_EMAIL_FROM || DEFAULT_FROM,
    replyTo: process.env.PORTAL_EMAIL_REPLY_TO || null,
  };
}

export function isEmailConfigured() {
  return readConfig() !== null;
}

/**
 * The absolute address to put behind links. Emails are read outside the
 * browser that requested anything, so a relative path is useless and the
 * request's own origin is not available by the time the queue drains.
 *
 * Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` to the production domain in
 * every deployment, which is what we want even from a preview: a link a member
 * follows should land on the real portal, not on a branch. `PORTAL_SITE_URL`
 * overrides it for the day there is a custom domain.
 */
export function siteUrl() {
  const configured = process.env.PORTAL_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  return "http://localhost:3000";
}

export async function sendEmail(message: EmailMessage) {
  const config = readConfig();

  if (!config) {
    // Not an error, and deliberately loud: this is what a developer sees
    // instead of an email, and the address is printed so the queue can be
    // checked without a mail client.
    console.info(
      `[email] not configured — would have sent "${message.subject}" to ${message.to}`,
    );
    return;
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      body: JSON.stringify({
        from: config.from,
        html: message.html,
        reply_to: config.replyTo ?? undefined,
        subject: message.subject,
        text: message.text,
        to: [message.to],
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch (cause) {
    throw new EmailError(
      cause instanceof Error ? cause.message : "The email service is unreachable.",
    );
  }

  if (!response.ok) {
    // Resend answers errors as `{ name, message }`. The body is read
    // defensively because an outage can return anything at all, and this
    // string ends up in `private.pending_notifications.last_error`.
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") detail = body.message;
    } catch {
      // Keep the status text.
    }
    throw new EmailError(detail, response.status);
  }
}
