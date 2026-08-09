/**
 * Transactional email templates in HTML and plain text.
 * The delivery contract is documented in `docs/integrations.md`.
 * The `html` tag escapes scalar values and inserts only module-built
 * `SafeHtml` fragments as markup.
 */

// The theme, from `globals.css`. Changing one of these means changing both.
const EGG = "#ede8da";
const MOODY = "#0f1118";

// Dark mode is deliberate rather than client-controlled. These are warm
// tints of EGG, so secondary copy stays in the portal's palette instead of
// becoming a cold email-client gray.
const INK_SECONDARY = "#c9c4b6";
const INK_FOOTER = "#9f9b91";
const DIVIDER = "#45464d";

// Barlow is the portal's face, but Gmail and several Outlook variants remove
// remote webfonts. Keep Barlow first for clients that support it, then choose
// the native face that is closest on each major platform instead of dropping
// straight to Arial (which is what made the delivered email look wrong).
const FONT_STACK_VALUE =
  "Barlow, 'Helvetica Neue', Roboto, Helvetica, Arial, sans-serif";

const LOGO_SIZE = 44;

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
    // `null`, `undefined` and `false` render as nothing rather than as the
    // words, so a conditional fragment is `${condition ? fragment : null}`.
    if (value instanceof SafeHtml) {
      out += value.value;
    } else if (value !== null && value !== undefined && value !== false) {
      out += escape(String(value));
    }
    out += strings[index + 1] ?? "";
  }

  return new SafeHtml(out);
}

// Safe by construction rather than by escaping: the quotes inside it are the
// point, and `escape` would turn them into entities in every `style` attribute
// on the page.
const FONT_STACK = new SafeHtml(FONT_STACK_VALUE);

function join(fragments: (SafeHtml | null)[]) {
  return new SafeHtml(
    fragments.filter((fragment): fragment is SafeHtml => fragment !== null).join(""),
  );
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The same format `access/page.tsx` and the review page use — "Jul 14, 2026",
 * as `en` renders these options. Those two pages show these same fields to
 * these same people, so the email has no business inventing a second one.
 *
 * The zone is pinned, and it has to be. `ended_on` arrives as a bare date like
 * `"2026-08-07"`, which `new Date` reads as UTC midnight; rendered in a zone
 * behind UTC that becomes "Aug 6" and the email states the wrong day. The
 * pages above run in the reader's browser, but this runs on a server whose
 * region is not a design decision.
 *
 * Oslo rather than UTC, because the readers are here: a decision made at 01:00
 * on the 8th is the 8th to them, not the 7th. It is also the safe direction —
 * a zone ahead of UTC cannot move a bare date backwards.
 */
const TIME_ZONE = "Europe/Oslo";

function formatMoment(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
    year: "numeric",
  }).format(moment);
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

/**
 * `scopeLabel` from `access/page.tsx`: an organization request is answered by
 * the organization, an alumni request by the portal.
 */
function scopeLabel(payload: Record<string, unknown>) {
  if (payload.request_type === "alumni") return "Alumni access";
  return text(payload.organization_name) ?? "An organization";
}

// `LegalShell`'s header. Images are blocked by default in a good share of
// clients, so the wordmark is live text sitting beside the mark rather than
// baked into it — with images off this still reads as NORSTEC Portal, which
// is the whole job of a masthead.
function masthead(siteUrl: string) {
  return html`<table
    bgcolor="${MOODY}"
    cellpadding="0"
    class="dark-canvas"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%;background-color:${MOODY}"
  >
    <tr>
      <td style="padding:0">
        <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
          <tr>
            <td style="padding-right:16px" valign="middle">
              <img
                alt=""
                height="${LOGO_SIZE}"
                src="${siteUrl}/images/logo.png"
                style="display:block;border:0;outline:none;text-decoration:none"
                width="${LOGO_SIZE}"
              />
            </td>
            <td valign="middle">
              <div
                class="dark-copy"
                style="font-family:${FONT_STACK};font-size:20px;font-weight:300;letter-spacing:0.14em;line-height:1.1;text-transform:uppercase;color:${EGG}"
              >
                NORSTEC
              </div>
              <div
                class="dark-copy-secondary"
                style="padding-top:4px;font-family:${FONT_STACK};font-size:11px;font-weight:500;letter-spacing:0.34em;line-height:1.1;text-transform:uppercase;color:${INK_SECONDARY}"
              >
                Portal
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// `text-h2`: Barlow, 300, uppercase. Requesting 200 keeps Barlow at its lowest
// loaded weight (300), while Helvetica Neue can use its native Thin cut in
// Gmail instead of looking like a default bold `h1`.
function heading(content: string) {
  return html`<h1
    class="dark-copy email-heading"
    style="margin:0;font-family:${FONT_STACK};font-size:36px;font-weight:200!important;font-synthesis:none;letter-spacing:-0.02em;line-height:1.05;text-transform:uppercase;color:${EGG}"
  >
    ${content}
  </h1>`;
}

function lead(content: string) {
  return html`<p
    class="dark-copy-secondary"
    style="margin:18px 0 0;font-family:${FONT_STACK};font-size:16px;font-weight:400;line-height:1.75;color:${INK_SECONDARY}"
  >
    ${content}
  </p>`;
}

// `gap` exists for one reason: a paragraph that follows the field list starts
// a new thought, and at the paragraph rhythm it reads as the tail of the
// reviewer's note instead.
function body(content: string, gap = 16) {
  return html`<p
    class="dark-copy"
    style="margin:${gap}px 0 0;font-family:${FONT_STACK};font-size:16px;font-weight:400;line-height:1.75;color:${EGG}"
  >
    ${content}
  </p>`;
}

// The `dl` from the reviewed layout: a `section-label` over its value.
function field(label: string, value: string) {
  return html`<tr>
    <td style="padding:24px 0 0">
      <div
        class="dark-copy-muted"
        style="font-family:${FONT_STACK};font-size:11px;font-weight:600;letter-spacing:0.12em;line-height:1.4;text-transform:uppercase;color:${INK_FOOTER}"
      >
        ${label}
      </div>
      <div
        class="dark-copy"
        style="padding-top:6px;font-family:${FONT_STACK};font-size:15px;font-weight:400;line-height:1.6;color:${EGG}"
      >
        ${value}
      </div>
    </td>
  </tr>`;
}

function fields(rows: (SafeHtml | null)[]) {
  const present = rows.filter((row): row is SafeHtml => row !== null);
  if (present.length === 0) return null;
  return html`<table
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%"
  >
    ${join(present)}
  </table>`;
}

// `portal-button` in dark mode: egg fill and dark label, then a transparent
// hover with egg type. Clients without `:hover` keep the high-contrast default;
// Outlook's Word engine keeps the same readable fallback.
function button(href: string, label: string) {
  return html`<table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr>
      <td
        bgcolor="${EGG}"
        class="portal-button-shell"
        style="border-radius:999px;background-color:${EGG}"
      >
        <a
          class="portal-button"
          href="${href}"
          style="display:inline-block;min-height:18px;padding:11px 20px;border:2px solid ${EGG};border-radius:999px;background-color:${EGG};font-family:${FONT_STACK};font-size:15px;font-weight:500;line-height:1.2;color:${MOODY};text-decoration:none;transition:background-color 180ms ease,color 180ms ease"
          >${label}</a
        >
      </td>
    </tr>
  </table>`;
}

// `portal-surface` in dark mode: dark canvas, egg outline and the same 2rem
// radius as the account and action cards this message points to.
function warning(headline: string, detail: string) {
  return html`<table
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:separate;border-spacing:0;width:100%;margin-top:30px"
  >
    <tr>
      <td
        bgcolor="${MOODY}"
        class="dark-canvas"
        style="border:2px solid ${EGG};border-radius:32px;background-color:${MOODY};padding:22px 24px"
      >
        <p class="dark-copy" style="margin:0;font-family:${FONT_STACK};font-size:18px;font-weight:400;line-height:1.4;color:${EGG}">
          ${headline}
        </p>
        <p class="dark-copy-secondary" style="margin:10px 0 0;font-family:${FONT_STACK};font-size:15px;font-weight:400;line-height:1.7;color:${INK_SECONDARY}">
          ${detail}
        </p>
      </td>
    </tr>
  </table>`;
}

function footer(siteUrl: string) {
  return html`<table
    bgcolor="${MOODY}"
    cellpadding="0"
    class="dark-canvas"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%;background-color:${MOODY}"
  >
    <tr>
      <td style="padding:28px 0 0;border-top:1px solid ${DIVIDER}">
        <p class="dark-copy-muted" style="margin:0;font-family:${FONT_STACK};font-size:13px;font-weight:400;line-height:1.7;color:${INK_FOOTER}">
          Sent by the NORSTEC Portal because a decision changed your access. It
          is not a newsletter and there is nothing to unsubscribe from.
          <a class="email-link dark-copy-secondary" href="${siteUrl}/privacy" style="color:${INK_SECONDARY};text-decoration:underline">How we handle your data</a>.
        </p>
      </td>
    </tr>
  </table>`;
}

function emailDocument(preheader: string, content: SafeHtml) {
  return html`<!doctype html>
<html lang="en" style="background-color:${MOODY};color:${EGG}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <meta name="theme-color" content="${MOODY}" />
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&amp;display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: only dark;
        supported-color-schemes: dark;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100% !important;
        background-color: ${MOODY} !important;
        color: ${EGG} !important;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      .dark-canvas {
        background-color: ${MOODY} !important;
      }
      .dark-copy {
        color: ${EGG} !important;
      }
      .dark-copy-secondary {
        color: ${INK_SECONDARY} !important;
      }
      .dark-copy-muted {
        color: ${INK_FOOTER} !important;
      }
      .email-heading {
        font-weight: 200 !important;
        font-synthesis: none !important;
      }
      a {
        color: ${EGG};
      }
      .portal-button:hover,
      .portal-button:focus {
        background-color: ${MOODY} !important;
        color: ${EGG} !important;
      }
      .portal-button-shell:hover,
      .portal-button-shell:focus-within {
        background-color: ${MOODY} !important;
      }
      .email-link:hover,
      .email-link:focus {
        color: ${EGG} !important;
      }
      @media (prefers-color-scheme: dark) {
        html,
        body,
        .dark-canvas {
          background-color: ${MOODY} !important;
        }
        .dark-copy {
          color: ${EGG} !important;
        }
        .dark-copy-secondary {
          color: ${INK_SECONDARY} !important;
        }
        .dark-copy-muted {
          color: ${INK_FOOTER} !important;
        }
      }
      [data-ogsb] .dark-canvas {
        background-color: ${MOODY} !important;
      }
      [data-ogsc] .dark-copy {
        color: ${EGG} !important;
      }
      [data-ogsc] .dark-copy-secondary {
        color: ${INK_SECONDARY} !important;
      }
      [data-ogsc] .dark-copy-muted {
        color: ${INK_FOOTER} !important;
      }
      /* Gmail on iOS fully inverts even explicitly dark emails. Gmail leaves
         gradient backgrounds alone and supports blend modes, so this
         Gmail-only wrapper reverses that forced inversion without changing the
         render in Apple Mail, Outlook or the browser preview. */
      u + .body .gmail-dark-wrap {
        background-color: #000000 !important;
        background-image: linear-gradient(#000000, #000000) !important;
      }
      u + .body .gmail-blend-screen {
        background-color: #000000;
        mix-blend-mode: screen;
      }
      u + .body .gmail-blend-difference {
        background-color: #000000;
        mix-blend-mode: difference;
      }
      @media (max-width: 600px) {
        .shell {
          padding: 28px 18px !important;
        }
        .main {
          padding: 34px 0 38px !important;
        }
        .display h1 {
          font-size: 30px !important;
        }
      }
    </style>
  </head>
  <body
    bgcolor="${MOODY}"
    class="body dark-canvas"
    style="margin:0;padding:0;background-color:${MOODY};color:${EGG}"
  >
    <div
      class="dark-canvas gmail-dark-wrap"
      style="background-color:${MOODY};background-image:linear-gradient(${MOODY},${MOODY})"
    >
      <div class="gmail-blend-screen">
        <div class="gmail-blend-difference">
          <div
            style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px"
          >
            ${preheader}
          </div>
          <table
            bgcolor="${MOODY}"
            cellpadding="0"
            class="dark-canvas"
            cellspacing="0"
            role="presentation"
            style="border-collapse:collapse;width:100%;background-color:${MOODY}"
          >
            <tr>
              <td
                align="center"
                bgcolor="${MOODY}"
                class="shell dark-canvas"
                style="padding:40px 20px;background-color:${MOODY}"
              >
                <table
                  bgcolor="${MOODY}"
                  cellpadding="0"
                  class="dark-canvas"
                  cellspacing="0"
                  role="presentation"
                  style="border-collapse:collapse;width:100%;max-width:600px;text-align:left;background-color:${MOODY}"
                  width="600"
                >
                  <tr>
                    <td
                      bgcolor="${MOODY}"
                      class="dark-canvas dark-copy"
                      style="background-color:${MOODY};font-family:${FONT_STACK};font-size:16px;font-weight:400;line-height:1.75;color:${EGG}"
                    >
                      ${content}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </body>
</html>`.value;
}

// One shell for all three, so the two decisions and the membership message
// read as one voice — the reason the reviewed layout gave for sharing it.
function shell({
  action,
  closing,
  detail,
  greeting,
  headline,
  intro,
  preheader,
  siteUrl,
}: {
  action: SafeHtml | null;
  closing: string | null;
  detail: SafeHtml | null;
  greeting: string;
  headline: string;
  intro: string;
  preheader: string;
  siteUrl: string;
}) {
  return emailDocument(
    preheader,
    html`${masthead(siteUrl)}
      <table
        bgcolor="${MOODY}"
        cellpadding="0"
        class="dark-canvas"
        cellspacing="0"
        role="presentation"
        style="border-collapse:collapse;width:100%;background-color:${MOODY}"
      >
        <tr>
          <td
            bgcolor="${MOODY}"
            class="main dark-canvas"
            style="padding:48px 0 52px;background-color:${MOODY}"
          >
            <div class="display">${heading(headline)}</div>
            ${lead(greeting)} ${lead(intro)} ${detail}
            ${closing
              ? html`<p
                  class="dark-copy-secondary"
                  style="margin:28px 0 0;font-family:${FONT_STACK};font-size:15px;font-weight:400;line-height:1.7;color:${INK_SECONDARY}"
                >
                  ${closing}
                </p>`
              : null}
            ${action ? html`<div style="padding-top:24px">${action}</div>` : null}
          </td>
        </tr>
      </table>
      ${footer(siteUrl)}`,
  );
}

const FOOTER_TEXT = (siteUrl: string) =>
  `Sent by the NORSTEC Portal because a decision changed your access. How we handle your data: ${siteUrl}/privacy`;

function plain(lines: (string | null)[]) {
  return lines.filter((line): line is string => line !== null).join("\n\n");
}

function approved({ payload, recipientName, siteUrl }: TemplateInput): RenderedEmail {
  const scope = scopeLabel(payload);
  const note = text(payload.decision_note);
  const requestedOn = formatMoment(payload.requested_at);
  const decidedOn = formatMoment(payload.decided_at);

  const intro = requestedOn
    ? `${scope} approved the request you sent on ${requestedOn}. You can sign in to the portal now.`
    : `${scope} approved your request. You can sign in to the portal now.`;

  return {
    html: shell({
      action: button(siteUrl, "Open the portal"),
      closing: "Sign in with the same Google account you applied with.",
      greeting: `Hi ${firstName(recipientName)},`,
      detail: fields([
        decidedOn ? field("Decided", decidedOn) : null,
        note ? field("Note from the reviewer", note) : null,
      ]),
      headline: "Your request was approved",
      intro,
      preheader: intro,
      siteUrl,
    }),
    // Deliberately not naming the organization: the reviewed design settled
    // that, because the address may be a shared or a family one and the
    // requester already knows what they asked for.
    subject: "Your NORSTEC Portal request was approved",
    text: plain([
      `Hi ${firstName(recipientName)},`,
      intro,
      decidedOn ? `Decided: ${decidedOn}` : null,
      note ? `Note from the reviewer:\n\n  ${note}` : null,
      "Sign in with the same Google account you applied with.",
      `Open the portal: ${siteUrl}`,
      FOOTER_TEXT(siteUrl),
    ]),
  };
}

function rejected({ payload, recipientName, siteUrl }: TemplateInput): RenderedEmail {
  const scope = scopeLabel(payload);
  const note = text(payload.decision_note);
  const requestedOn = formatMoment(payload.requested_at);
  const decidedOn = formatMoment(payload.decided_at);

  const intro = requestedOn
    ? `${scope} did not approve the request you sent on ${requestedOn}.`
    : `${scope} did not approve your request.`;
  // True, and the only thing that explains why signing in will not work:
  // `private.discard_declined_applicant` erases the profile in the same
  // transaction that queues this email.
  const erasure =
    "We have not kept a profile for you. The request, and everything you gave with it, was deleted when the decision was made.";
  const closing =
    "You are welcome to apply again — signing in builds a new profile. If you think this was a mistake, reply to this email.";

  return {
    html: shell({
      action: button(`${siteUrl}/access`, "Send a new request"),
      closing,
      detail: join([
        fields([
          decidedOn ? field("Decided", decidedOn) : null,
          note ? field("Note from the reviewer", note) : null,
        ]),
        body(erasure, 30),
      ]),
      greeting: `Hi ${firstName(recipientName)},`,
      headline: "Your request was declined",
      intro,
      preheader: intro,
      siteUrl,
    }),
    subject: "Your NORSTEC Portal request was declined",
    text: plain([
      `Hi ${firstName(recipientName)},`,
      intro,
      decidedOn ? `Decided: ${decidedOn}` : null,
      note ? `Note from the reviewer:\n\n  ${note}` : null,
      erasure,
      closing,
      `Send a new request: ${siteUrl}/access`,
      FOOTER_TEXT(siteUrl),
    ]),
  };
}

function membershipEnded({
  payload,
  recipientName,
  siteUrl,
}: TemplateInput): RenderedEmail {
  const organization = text(payload.organization_name) ?? "NORSTEC";
  const endedOn = formatMoment(payload.ended_on);
  // Strictly `true`. The flag arrives as JSON from Postgres, and a truthy
  // string is not a reason to tell somebody they are about to be locked out.
  const workspaceOnly = payload.workspace_sign_in_only === true;

  const intro = `${organization} has ended your membership, and it was your last active one. You are an alumnus in the portal from now on.`;
  const keeps =
    "You keep access. Your profile, your membership history and the roles you held all stay as they are, and you can still see the member directory.";
  const warningHeadline =
    "You sign in with your norstec.no account, and only that account.";
  const warningDetail =
    "If that Google Workspace account is suspended or deleted, you lose the portal with it — and you cannot add another sign-in once you are locked out. Add a personal Google account to your profile while you still can.";
  const action = workspaceOnly ? "Add a personal Google account" : "Open your profile";

  return {
    html: shell({
      action: button(`${siteUrl}/profile`, action),
      closing: null,
      detail: join([
        fields([endedOn ? field("Ended", endedOn) : null]),
        body(keeps, 30),
        workspaceOnly ? warning(warningHeadline, warningDetail) : null,
      ]),
      greeting: `Hi ${firstName(recipientName)},`,
      headline: "Your membership has ended",
      intro,
      preheader: workspaceOnly
        ? `${intro} Your norstec.no sign-in is at risk.`
        : intro,
      siteUrl,
    }),
    subject: `Your ${organization} membership has ended`,
    text: plain([
      `Hi ${firstName(recipientName)},`,
      intro,
      endedOn ? `Ended: ${endedOn}` : null,
      keeps,
      workspaceOnly ? `${warningHeadline} ${warningDetail}` : null,
      `${action}: ${siteUrl}/profile`,
      FOOTER_TEXT(siteUrl),
    ]),
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
