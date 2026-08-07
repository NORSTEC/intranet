/**
 * The three emails the portal sends, each as an HTML part and a plain-text
 * part. Both are required: a message with no text alternative is a spam
 * signal, and some people genuinely read mail as text.
 *
 * ## Where the design comes from
 *
 * Not invented here. `docs/access-decision-notification.md` holds the layout
 * and copy that were designed and reviewed for the in-portal version of the
 * two decision messages before there was a sender — heading, the supporting
 * sentence, a `dl` of *Decided* and an optional *Note from the reviewer*, then
 * a closing line. The membership email follows the same shell so the three
 * read as one voice.
 *
 * The visual language is the portal's own, translated: `--color-egg` canvas,
 * a `portal-surface` card (2px `--color-moody` border, 2rem radius, egg fill),
 * `text-h2` headings (Barlow, 300, uppercase), and a `portal-button` pill.
 * `LegalShell`'s masthead — logo, `NORSTEC` tracked at 0.14em, `Portal` at
 * 0.34em beneath — is reproduced above the card, because the privacy policy
 * these emails link to is the surface a recipient is most likely to see next.
 *
 * ## What email costs
 *
 * Every value is a literal. Email clients resolve no custom properties, so
 * `--color-moody` cannot travel; the constants below are the same hex the
 * theme defines, and they have to be changed together.
 *
 * The portal's muted text is `opacity-55` and `opacity-45`. Opacity is
 * unreliable across clients and both fall under 4.5:1 anyway, so the secondary
 * tones here are solid colours mixed from the ink and the canvas — warm rather
 * than gray, because the canvas is warm — and every one of them passes.
 *
 * Barlow is requested and will arrive in Apple Mail and iOS Mail. Gmail and
 * Outlook ignore webfonts entirely and fall back, so the stack is the portal's
 * own `Arial Narrow, Arial` rather than a generic sans: the fallback is part
 * of the design, not an accident.
 *
 * `color-scheme: light` is declared so that Apple Mail and Outlook stop
 * inverting the palette themselves. The egg canvas *is* the portal's default
 * appearance, and a client-invented dark version of it is not the dark theme.
 *
 * Markup is built through {@link html}, a tagged template that escapes each
 * interpolation and passes through only fragments built the same way. All
 * three messages interpolate something a person typed — a full name, an
 * organization name, an administrator's note — so this is a safety decision
 * rather than a stylistic one, and `templates.test.ts` asserts it.
 */

// The theme, from `globals.css`. Changing one of these means changing both.
const EGG = "#ede8da";
const MOODY = "#0f1118";

// Mixed from MOODY over EGG, because a gray on a warm canvas reads as dirt.
// 6.5:1, 5.9:1 and 5.4:1 against the canvas.
const INK_SECONDARY = "#54504a";
const INK_LABEL = "#5c574f";
const INK_FOOTER = "#625c53";
// `--color-sun`, the fill `portal-toast` uses for a warning. Ink on it is
// 9.9:1.
const SUN = "#f3ad78";

// `--font-sans`, verbatim. Barlow reaches the clients that honour the webfont
// link; the rest land on the same fallback the portal itself uses.
const FONT_STACK_VALUE = "Barlow, 'Arial Narrow', Arial, sans-serif";

const LOGO_SIZE = 40;

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
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%"
  >
    <tr>
      <td style="padding:0 0 20px;border-bottom:1px solid ${MOODY}">
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
                style="font-size:19px;font-weight:300;letter-spacing:0.14em;line-height:1.1;text-transform:uppercase;color:${MOODY}"
              >
                NORSTEC
              </div>
              <div
                style="padding-top:3px;font-size:11px;font-weight:500;letter-spacing:0.34em;line-height:1.1;text-transform:uppercase;color:${INK_LABEL}"
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

// `text-h2`: Barlow, 300, uppercase. The portal clamps it to 2.5rem at the
// top; 30px is that scale at an email's fixed 540px measure. The card owns the
// space above it, so the heading carries no top margin of its own.
function heading(content: string) {
  return html`<h1
    style="margin:0;font-family:${FONT_STACK};font-size:30px;font-weight:300;line-height:1.1;text-transform:uppercase;color:${MOODY}"
  >
    ${content}
  </h1>`;
}

function lead(content: string) {
  return html`<p
    style="margin:16px 0 0;font-size:16px;font-weight:400;line-height:1.75;color:${INK_SECONDARY}"
  >
    ${content}
  </p>`;
}

// `gap` exists for one reason: a paragraph that follows the field list starts
// a new thought, and at the paragraph rhythm it reads as the tail of the
// reviewer's note instead.
function body(content: string, gap = 16) {
  return html`<p
    style="margin:${gap}px 0 0;font-size:16px;font-weight:400;line-height:1.75;color:${MOODY}"
  >
    ${content}
  </p>`;
}

// The `dl` from the reviewed layout: a `section-label` over its value.
function field(label: string, value: string) {
  return html`<tr>
    <td style="padding:24px 0 0">
      <div
        style="font-size:11px;font-weight:600;letter-spacing:0.12em;line-height:1.4;text-transform:uppercase;color:${INK_LABEL}"
      >
        ${label}
      </div>
      <div
        style="padding-top:6px;font-size:15px;font-weight:400;line-height:1.6;color:${MOODY}"
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

// `portal-button`: pill, moody fill, egg label. Outlook's Word engine drops
// the radius and leaves a filled rectangle, which is a fair trade against the
// VML scaffolding the alternative needs.
function button(href: string, label: string) {
  return html`<table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr>
      <td
        style="border-radius:999px;background:${MOODY}"
      >
        <a
          href="${href}"
          style="display:inline-block;padding:13px 26px;border:2px solid ${MOODY};border-radius:999px;font-family:${FONT_STACK};font-size:15px;font-weight:500;line-height:1.2;color:${EGG};text-decoration:none"
          >${label}</a
        >
      </td>
    </tr>
  </table>`;
}

// The portal's own warning is `portal-toast` with `bg-sun`: a 2px moody
// border, a 1rem radius and a solid `--color-sun` fill. Reusing that rather
// than inventing an accent rule means a member has already seen this exact
// object inside the portal, and it is the only alert vocabulary the design
// system actually has.
function warning(headline: string, detail: string) {
  return html`<table
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%;margin-top:30px"
  >
    <tr>
      <td
        style="border:2px solid ${MOODY};border-radius:16px;background:${SUN};padding:18px 20px"
      >
        <p style="margin:0;font-size:15px;font-weight:600;line-height:1.6;color:${MOODY}">
          ${headline}
        </p>
        <p style="margin:8px 0 0;font-size:15px;font-weight:400;line-height:1.7;color:${MOODY}">
          ${detail}
        </p>
      </td>
    </tr>
  </table>`;
}

function footer(siteUrl: string) {
  return html`<table
    cellpadding="0"
    cellspacing="0"
    role="presentation"
    style="border-collapse:collapse;width:100%"
  >
    <tr>
      <td style="padding:28px 8px 0">
        <p style="margin:0;font-size:13px;font-weight:400;line-height:1.7;color:${INK_FOOTER}">
          Sent by the NORSTEC Portal because a decision changed your access. It
          is not a newsletter and there is nothing to unsubscribe from.
          <a href="${siteUrl}/privacy" style="color:${INK_FOOTER}">How we handle your data</a>.
        </p>
      </td>
    </tr>
  </table>`;
}

function emailDocument(preheader: string, content: SafeHtml) {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&amp;display=swap"
      rel="stylesheet"
    />
    <style>
      body {
        margin: 0;
        padding: 0;
        width: 100% !important;
      }
      a {
        color: ${MOODY};
      }
      @media (max-width: 600px) {
        .shell {
          padding: 24px 16px !important;
        }
        .card {
          padding: 28px 22px !important;
        }
        .display {
          font-size: 26px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${EGG}">
    <div
      style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px"
    >
      ${preheader}
    </div>
    <table
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="border-collapse:collapse;width:100%;background:${EGG}"
    >
      <tr>
        <td align="center" class="shell" style="padding:40px 20px">
          <table
            cellpadding="0"
            cellspacing="0"
            role="presentation"
            style="border-collapse:collapse;width:100%;max-width:540px;text-align:left"
            width="540"
          >
            <tr>
              <td
                style="font-family:${FONT_STACK};font-size:16px;font-weight:400;line-height:1.75;color:${MOODY}"
              >
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
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
        cellpadding="0"
        cellspacing="0"
        role="presentation"
        style="border-collapse:collapse;width:100%;margin-top:28px;border:2px solid ${MOODY};border-radius:32px;background:${EGG}"
      >
        <tr>
          <td class="card" style="padding:36px 34px 38px">
            <div class="display">${heading(headline)}</div>
            ${lead(greeting)} ${lead(intro)} ${detail}
            ${closing
              ? html`<p
                  style="margin:28px 0 0;font-size:15px;font-weight:400;line-height:1.7;color:${INK_SECONDARY}"
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
