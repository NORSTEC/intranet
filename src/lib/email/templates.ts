/**
 * The three emails the portal sends, each as an HTML part and a plain-text
 * part. Both are required: a message with no text alternative is a spam
 * signal, and some people genuinely read mail as text.
 *
 * Every one of these messages interpolates something a person typed — a full
 * name, an organization name, an administrator's decision note — so the markup
 * is built through {@link html}, a tagged template that escapes each
 * interpolation and passes through only fragments built the same way.
 * Concatenating those strings by hand is an injection waiting to happen, and
 * `templates.test.ts` asserts the escaping so a future tidy-up cannot quietly
 * remove it.
 *
 * This started as JSX and `renderToStaticMarkup`, which would have done the
 * same job. Next refuses `react-dom/server` inside the server-component graph
 * a server action runs in, and reaching for a rendering library to produce
 * four hundred bytes of table markup would be the wrong trade.
 *
 * Everything is inline styles and a single column. Email clients support a
 * decade-old subset of CSS between them, `<style>` blocks are stripped by
 * several, and nothing here is worth the fight. There is also no dark-mode
 * variant on purpose: clients invert mail themselves, inconsistently, and a
 * design that only survives one of the two outcomes is worse than a plain one
 * that survives both.
 */

const BODY_BACKGROUND = "#ede8da";
const INK = "#0f1118";
const ACCENT = "#1697b7";
const WARNING_BACKGROUND = "#fdf0e6";
const WARNING_BORDER = "#e8804c";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export type NotificationKind =
  | "access_request_approved"
  | "access_request_rejected"
  | "membership_ended";

export type RenderedEmail = {
  html: string;
  subject: string;
  text: string;
};

type TemplateInput = {
  payload: Record<string, unknown>;
  recipientName: string;
  siteUrl: string;
};

/**
 * Markup that is already safe, because it came out of {@link html}. Nothing
 * else can produce one, which is what makes the escaping below sound: an
 * interpolation is either a fragment this module built or a value to escape.
 */
class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? "";

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    // `null` and `undefined` render as nothing rather than as the words, so a
    // conditional fragment can be written as `${condition ? fragment : null}`.
    if (value instanceof SafeHtml) {
      out += value.value;
    } else if (value !== null && value !== undefined && value !== false) {
      out += escape(String(value));
    }
    out += strings[index + 1] ?? "";
  }

  return new SafeHtml(out);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The name is used as a greeting, so the first name is what is wanted. People
 * are stored with a `full_name`, and splitting on the first space is right
 * often enough and harmless when it is not — "Hi Anne" for "Anne Berit" reads
 * fine, and a single-word name is returned unchanged.
 */
function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function heading(content: string) {
  return html`<h1
    style="font-size:22px;font-weight:700;line-height:1.3;margin:0 0 20px"
  >
    ${content}
  </h1>`;
}

function paragraph(content: string) {
  return html`<p style="margin:0 0 16px">${content}</p>`;
}

function button(href: string, label: string) {
  return html`<p style="margin:28px 0">
    <a
      href="${href}"
      style="background:${INK};border-radius:2px;color:${BODY_BACKGROUND};display:inline-block;font-weight:700;padding:12px 22px;text-decoration:none"
      >${label}</a
    >
  </p>`;
}

/**
 * An administrator's own words, shown as a quotation so it is unmistakably
 * theirs and not the portal's.
 */
function note(content: string) {
  return html`${paragraph("The administrator wrote:")}
    <blockquote
      style="border-left:3px solid ${ACCENT};margin:0 0 16px;padding:2px 0 2px 16px"
    >
      ${content}
    </blockquote>`;
}

function warning(headline: string, body: string) {
  return html`<table
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;margin:0 0 16px;width:100%"
  >
    <tr>
      <td
        style="background:${WARNING_BACKGROUND};border-left:3px solid ${WARNING_BORDER};padding:16px 18px"
      >
        <p style="font-weight:700;margin:0 0 8px">${headline}</p>
        <p style="margin:0">${body}</p>
      </td>
    </tr>
  </table>`;
}

function footer(siteUrl: string) {
  return html`<p
    style="border-top:1px solid rgba(15,17,24,0.15);font-size:13px;margin:32px 0 0;opacity:0.7;padding-top:16px"
  >
    Sent by the NORSTEC Portal because of a change to your membership. It is not
    a newsletter and there is nothing to unsubscribe from.
    <a href="${siteUrl}/privacy" style="color:${INK}">How we handle your data</a
    >.
  </p>`;
}

function layout(body: SafeHtml) {
  return html`<!doctype html>
    <html>
      <body style="margin:0;padding:0">
        <table
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="background:${BODY_BACKGROUND};border-collapse:collapse;width:100%"
        >
          <tr>
            <td style="padding:32px 16px">
              <table
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="border-collapse:collapse;margin:0 auto;max-width:540px;width:100%"
              >
                <tr>
                  <td
                    style="color:${INK};font-family:${FONT_STACK};font-size:16px;line-height:1.6"
                  >
                    ${body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`.value;
}

const FOOTER_TEXT = (siteUrl: string) =>
  `Sent by the NORSTEC Portal because of a change to your membership. How we handle your data: ${siteUrl}/privacy`;

function approved({ payload, recipientName, siteUrl }: TemplateInput): RenderedEmail {
  const organization = text(payload.organization_name);
  const decisionNote = text(payload.decision_note);
  const isAlumniRequest = payload.request_type === "alumni";

  const what = isAlumniRequest
    ? "Your request for alumni access has been approved"
    : `Your request to join ${organization ?? "NORSTEC"} has been approved`;
  const detail =
    "You can sign in to the portal now — use the same Google account you applied with.";

  return {
    html: layout(html`${heading(`${what}.`)} ${paragraph(`Hi ${firstName(recipientName)},`)}
    ${paragraph(`${what}. ${detail}`)} ${decisionNote ? note(decisionNote) : null}
    ${button(siteUrl, "Open the portal")} ${footer(siteUrl)}`),
    subject: isAlumniRequest
      ? "Your alumni access was approved"
      : `You have been approved for ${organization ?? "NORSTEC"}`,
    text: [
      `Hi ${firstName(recipientName)},`,
      `${what}. ${detail}`,
      ...(decisionNote ? [`The administrator wrote:\n\n  ${decisionNote}`] : []),
      `Open the portal: ${siteUrl}`,
      FOOTER_TEXT(siteUrl),
    ].join("\n\n"),
  };
}

function rejected({ payload, recipientName, siteUrl }: TemplateInput): RenderedEmail {
  const organization = text(payload.organization_name);
  const decisionNote = text(payload.decision_note);
  const isAlumniRequest = payload.request_type === "alumni";

  const what = isAlumniRequest
    ? "Your request for alumni access was not approved"
    : `Your request to join ${organization ?? "NORSTEC"} was not approved`;
  // True, and the only thing that explains why signing in will not work:
  // `private.discard_declined_applicant` erases the profile in the same
  // transaction that queues this email.
  const erasure =
    "We have not kept a profile for you. The request, and the details you gave with it, have been deleted. If you think this was a mistake, reply to this email — you are welcome to apply again.";

  return {
    html: layout(html`${heading(`${what}.`)} ${paragraph(`Hi ${firstName(recipientName)},`)}
    ${paragraph(`${what}.`)} ${decisionNote ? note(decisionNote) : null}
    ${paragraph(erasure)} ${footer(siteUrl)}`),
    subject: "Your NORSTEC Portal request was not approved",
    text: [
      `Hi ${firstName(recipientName)},`,
      `${what}.`,
      ...(decisionNote ? [`The administrator wrote:\n\n  ${decisionNote}`] : []),
      erasure,
      FOOTER_TEXT(siteUrl),
    ].join("\n\n"),
  };
}

function membershipEnded({
  payload,
  recipientName,
  siteUrl,
}: TemplateInput): RenderedEmail {
  const organization = text(payload.organization_name) ?? "NORSTEC";
  // Strictly `true`. The flag arrives as JSON from Postgres, and a truthy
  // string is not a reason to tell somebody they are about to be locked out.
  const workspaceOnly = payload.workspace_sign_in_only === true;

  const opening = `Your membership of ${organization} has been ended, and it was your last active one. You are an alumnus in the portal from now on.`;
  const keeps =
    "You keep access. Your profile, your membership history and the roles you held all stay as they are, and you can still see the member directory.";
  const warningHeadline =
    "You sign in with your norstec.no account, and only that account.";
  const warningBody =
    "If that Google Workspace account is suspended or deleted, you lose the portal with it — and you cannot add another sign-in once you are locked out. Add a personal Google account to your profile while you still can.";
  const action = workspaceOnly ? "Add a personal Google account" : "Open your profile";

  return {
    html: layout(html`${heading(`Your ${organization} membership has ended.`)}
    ${paragraph(`Hi ${firstName(recipientName)},`)} ${paragraph(opening)}
    ${paragraph(keeps)} ${workspaceOnly ? warning(warningHeadline, warningBody) : null}
    ${button(`${siteUrl}/profile`, action)} ${footer(siteUrl)}`),
    subject: `Your ${organization} membership has ended`,
    text: [
      `Hi ${firstName(recipientName)},`,
      opening,
      keeps,
      ...(workspaceOnly ? [`${warningHeadline} ${warningBody}`] : []),
      `${action}: ${siteUrl}/profile`,
      FOOTER_TEXT(siteUrl),
    ].join("\n\n"),
  };
}

const templates: Record<NotificationKind, (input: TemplateInput) => RenderedEmail> = {
  access_request_approved: approved,
  access_request_rejected: rejected,
  membership_ended: membershipEnded,
};

// `hasOwn` rather than `in`: the kind arrives as a string from the database,
// and `in` walks the prototype chain, so "toString" and "constructor" would
// both pass for a template that does not exist.
export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(templates, value);
}

export function renderNotification(
  kind: NotificationKind,
  input: TemplateInput,
): RenderedEmail {
  return templates[kind](input);
}
