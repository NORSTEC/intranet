import { describe, expect, it } from "vitest";
import { isNotificationKind, renderNotification } from "@/lib/email/templates";

const site = "https://portal.norstec.no";

function approved(payload: Record<string, unknown>, recipientName = "Ada Lovelace") {
  return renderNotification("access_request_approved", {
    payload,
    recipientName,
    siteUrl: site,
  });
}

function rejected(payload: Record<string, unknown>, recipientName = "Ada Lovelace") {
  return renderNotification("access_request_rejected", {
    payload,
    recipientName,
    siteUrl: site,
  });
}

function membershipEnded(
  payload: Record<string, unknown>,
  recipientName = "Ada Lovelace",
) {
  return renderNotification("membership_ended", {
    payload,
    recipientName,
    siteUrl: site,
  });
}

describe("every notification", () => {
  const rendered = [
    approved({ organization_name: "Orbit NTNU" }),
    rejected({ organization_name: "Orbit NTNU" }),
    membershipEnded({ organization_name: "Orbit NTNU" }),
  ];

  it("carries a plain-text alternative as well as HTML", () => {
    for (const email of rendered) {
      expect(email.text.trim()).not.toBe("");
      expect(email.html).toContain("<!doctype html>");
      expect(email.subject.trim()).not.toBe("");
    }
  });

  // Links are read outside the browser that caused any of this, so a relative
  // path would go nowhere — including the logo, which no client can resolve.
  it("links and loads absolutely", () => {
    for (const email of rendered) {
      expect(email.html).toContain(`${site}/privacy`);
      expect(email.html).toContain(`${site}/images/logo.png`);
      expect(email.text).toContain(`${site}/privacy`);
      expect(email.html).not.toMatch(/(src|href)="\//);
    }
  });

  it("greets by first name", () => {
    for (const email of rendered) {
      expect(email.text).toContain("Hi Ada,");
      expect(email.text).not.toContain("Lovelace");
    }
  });

  // The masthead is live text beside the mark rather than an image of the
  // wordmark, so a client with images off still shows who wrote.
  it("names the sender without needing the logo to load", () => {
    for (const email of rendered) {
      const withoutImages = email.html.replace(/<img[^>]*>/g, "");
      expect(withoutImages).toContain("NORSTEC");
      expect(withoutImages).toContain("Portal");
    }
  });

  // Clients disagree about how much of <head> they keep. The modern scheme
  // declarations and the old bgcolor fallback therefore have to agree.
  it("pins the colour scheme to the portal's dark canvas", () => {
    for (const email of rendered) {
      expect(email.html).toContain('name="color-scheme" content="dark"');
      expect(email.html).toContain('name="supported-color-schemes" content="dark"');
      expect(email.html).toContain('name="theme-color" content="#0f1118"');
      expect(email.html).toContain("color-scheme: only dark");
      expect(email.html).toContain('bgcolor="#0f1118"');
      expect(email.html).toContain("background-color:#0f1118");
      expect(email.html).toContain('class="dark-canvas"');
      expect(email.html).toContain("background-image:linear-gradient(#0f1118,#0f1118)");
      expect(email.html).toContain('class="body dark-canvas"');
      expect(email.html).toContain('class="gmail-blend-screen"');
      expect(email.html).toContain('class="gmail-blend-difference"');
      expect(email.html).toContain("u + .body .gmail-dark-wrap");
      expect(email.html).toContain(
        "background-image: linear-gradient(#000000, #000000) !important",
      );
      expect(email.html).toContain("mix-blend-mode: screen");
      expect(email.html).toContain("mix-blend-mode: difference");
      expect(email.html).toMatch(
        /<div\s+class="dark-canvas gmail-dark-wrap"[\s\S]*?>\s*<div class="gmail-blend-screen">\s*<div class="gmail-blend-difference">[\s\S]*?<h1/,
      );
      expect(email.html).toContain("#ede8da");
      expect(email.html).toContain(
        "Barlow, 'Helvetica Neue', Roboto, Helvetica, Arial, sans-serif",
      );
      expect(email.html).not.toContain('font-family:Barlow, "Helvetica Neue"');
    }
  });

  it("uses an open layout instead of wrapping the message in a bordered card", () => {
    for (const email of rendered) {
      expect(email.html).not.toContain("border-radius:32px");
      expect(email.html).not.toContain("class=\"card\"");
    }
  });

  it("keeps the heading thin when Gmail falls back to Helvetica", () => {
    for (const email of rendered) {
      expect(email.html).toContain('class="dark-copy email-heading"');
      expect(email.html).toContain("font-weight:200!important");
      expect(email.html).toContain("font-synthesis:none");
      expect(email.html).toContain(".email-heading");
    }
  });

  it("gives every call to action a visible hover state", () => {
    for (const email of rendered) {
      expect(email.html).toContain('class="portal-button"');
      expect(email.html).toContain(".portal-button:hover");
      expect(email.html).toContain("background-color:#ede8da");
    }
  });

  it("does not introduce a decorative stripe below the logo", () => {
    for (const email of rendered) {
      expect(email.html).not.toContain('height="3"');
    }
  });

  it("opens with a preheader rather than leaking the first markup it finds", () => {
    for (const email of rendered) {
      const preheader = email.html.match(/font-size:1px;line-height:1px"\s*>\s*([^<]+)/);
      expect(preheader?.[1]?.trim().length ?? 0).toBeGreaterThan(20);
    }
  });
});

// Every one of these emails interpolates something a person typed. The reason
// the templates go through a tagged template is that it escapes them, and the
// reason this test exists is that a plain string concatenation would look
// tidier and be wrong.
describe("untrusted text", () => {
  it("is escaped rather than rendered, wherever it appears", () => {
    const email = rejected(
      {
        decision_note: "<script>alert('note')</script>",
        organization_name: "<img src=x onerror=alert(1)>",
      },
      "<b>Ada</b> Lovelace",
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).not.toContain("<b>Ada</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  // A name reaches the `style` and `href` attributes through no path today,
  // but quotes are escaped so that adding one cannot break out of either.
  it("escapes quotes, not only angle brackets", () => {
    const email = approved({ organization_name: 'Orbit" onmouseover="x' });
    expect(email.html).not.toContain('onmouseover="x');
    expect(email.html).toContain("&quot;");
  });
});

describe("an approved request", () => {
  it("names who approved it and when it was asked for", () => {
    const email = approved({
      organization_name: "Orbit NTNU",
      requested_at: "2026-07-14T09:00:00Z",
    });
    expect(email.text).toContain("Orbit NTNU approved the request you sent on Jul 14, 2026");
  });

  // Settled by the reviewed design: the address may be a shared one, and the
  // requester already knows what they asked for.
  it("keeps the organization out of the subject", () => {
    const email = approved({ organization_name: "Orbit NTNU" });
    expect(email.subject).toBe("Your NORSTEC Portal request was approved");
  });

  // An alumni request belongs to no organization, so there is no name to use.
  it("says alumni access instead when there is no organization", () => {
    const email = approved({ organization_name: null, request_type: "alumni" });
    expect(email.text).toContain("Alumni access approved");
  });

  it("falls back rather than naming nobody", () => {
    const email = approved({ organization_name: null });
    expect(email.text).toContain("An organization approved");
  });

  // `formatMoment` pins Europe/Oslo. Without it these assertions pass or fail
  // depending on where the runner sits, and a member gets an email stating the
  // wrong day.
  it("reads a late-evening decision as the reader's next day", () => {
    const email = approved({
      decided_at: "2026-08-07T23:30:00Z",
      organization_name: "Orbit NTNU",
    });
    expect(email.text).toContain("Decided: Aug 8, 2026");
  });

  it("shows the decision date as a field", () => {
    const email = approved({
      decided_at: "2026-08-01T12:30:00Z",
      organization_name: "Orbit NTNU",
    });
    expect(email.html).toContain("Decided");
    expect(email.html).toContain("Aug 1, 2026");
    expect(email.text).toContain("Decided: Aug 1, 2026");
  });

  // A sentence promising a date, with no date under it, is worse than no field.
  it("leaves the field out when the date is missing or unusable", () => {
    for (const payload of [{}, { decided_at: "not a date" }, { decided_at: null }]) {
      expect(approved(payload).html).not.toContain("Decided");
    }
  });

  it("quotes the reviewer's note under its own label", () => {
    const email = approved({
      decision_note: "Welcome aboard.",
      organization_name: "Orbit NTNU",
    });
    expect(email.html).toContain("Note from the reviewer");
    expect(email.text).toContain("Welcome aboard.");
  });

  it("says nothing about a note when there is none", () => {
    const email = approved({ decision_note: null, organization_name: "Orbit NTNU" });
    expect(email.html).not.toContain("Note from the reviewer");
  });

  // Whitespace is not a note. Rendering one would leave an empty field under a
  // label promising the reviewer said something.
  it("treats a blank note as no note", () => {
    const email = approved({ decision_note: "   ", organization_name: "Orbit NTNU" });
    expect(email.html).not.toContain("Note from the reviewer");
  });
});

describe("a declined request", () => {
  it("keeps the organization out of the subject too", () => {
    expect(rejected({ organization_name: "Orbit NTNU" }).subject).toBe(
      "Your NORSTEC Portal request was declined",
    );
  });

  // The profile is erased in the same transaction that queues this email, so
  // saying so is both true and the only thing that explains why signing in
  // will not work.
  it("says the profile was not kept", () => {
    const email = rejected({ organization_name: "Orbit NTNU" });
    expect(email.text).toContain("not kept a profile");
  });

  it("sends them to the request page, not to a portal they cannot open", () => {
    const email = rejected({ organization_name: "Orbit NTNU" });
    expect(email.html).toContain(`${site}/access`);
    expect(email.html).not.toContain("Open the portal");
  });
});

describe("an ended membership", () => {
  // Not just "norstec.no" — the footer and every link already carry the
  // portal's own domain, so the warning has to be recognised by its sentence.
  const warning = "You sign in with your norstec.no account";

  it("names the organization, since here the subject may be one of several", () => {
    const email = membershipEnded({ organization_name: "Orbit NTNU" });
    expect(email.subject).toBe("Your Orbit NTNU membership has ended");
  });

  it("warns about the sign-in when norstec.no is the only way in", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: true,
    });
    expect(email.text).toContain(warning);
    expect(email.text).toContain("Add a personal Google account");
    expect(email.html).toContain(`${site}/profile`);
    // `portal-surface` in dark mode: dark canvas with the portal's light
    // outline and 2rem radius, not a new colored callout treatment.
    expect(email.html).not.toContain("background:#f3ad78");
    expect(email.html).toContain("border:2px solid #ede8da");
    expect(email.html).toContain("border-radius:32px");
  });

  it("says so in the preheader, where an inbox list will show it", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: true,
    });
    expect(email.html).toContain("Your norstec.no sign-in is at risk.");
  });

  it("leaves the warning out when they can already sign in another way", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: false,
    });
    expect(email.text).not.toContain(warning);
    expect(email.text).toContain("Open your profile");
  });

  // The flag arrives as JSON from Postgres. Anything other than a true boolean
  // must not be read as a reason to warn.
  it("does not warn on a missing flag", () => {
    expect(membershipEnded({ organization_name: "Orbit NTNU" }).text).not.toContain(
      warning,
    );
  });

  it("does not warn on a truthy string either", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: "false",
    });
    expect(email.text).not.toContain(warning);
  });

  // A bare date is UTC midnight once `new Date` has read it. Rendered in a
  // zone behind UTC that becomes the day before, and the email is wrong.
  it("shows when it ended, on the day it actually ended", () => {
    const email = membershipEnded({
      ended_on: "2026-08-07",
      organization_name: "Orbit NTNU",
    });
    expect(email.html).toContain("Ended");
    expect(email.text).toContain("Ended: Aug 7, 2026");
  });

  it("still says what it is about when the organization has no name", () => {
    expect(membershipEnded({ organization_name: null }).subject).toContain("NORSTEC");
  });
});

describe("isNotificationKind", () => {
  it("accepts the three kinds the database can queue", () => {
    expect(isNotificationKind("access_request_approved")).toBe(true);
    expect(isNotificationKind("access_request_rejected")).toBe(true);
    expect(isNotificationKind("membership_ended")).toBe(true);
  });

  // The guard is what stops `renderNotification` being reached with a kind it
  // has no template for, which is why the drain skips rather than settles.
  it("rejects anything else, including inherited object properties", () => {
    expect(isNotificationKind("membership_started")).toBe(false);
    expect(isNotificationKind("toString")).toBe(false);
    expect(isNotificationKind("")).toBe(false);
  });
});
