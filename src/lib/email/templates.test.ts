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
  // path would go nowhere.
  it("links absolutely, and to the privacy notice", () => {
    for (const email of rendered) {
      expect(email.html).toContain(`${site}/privacy`);
      expect(email.text).toContain(`${site}/privacy`);
    }
  });

  it("greets by first name", () => {
    for (const email of rendered) {
      expect(email.text).toContain("Hi Ada,");
      expect(email.text).not.toContain("Lovelace");
    }
  });
});

// Every one of these emails interpolates something a person typed. The reason
// the templates are JSX rather than string concatenation is that JSX escapes
// it, and the reason this test exists is that a future rewrite to template
// literals would look tidier and be wrong.
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
});

describe("an approved request", () => {
  it("names the organization it was for", () => {
    const email = approved({ organization_name: "Orbit NTNU" });
    expect(email.subject).toContain("Orbit NTNU");
    expect(email.text).toContain("Orbit NTNU");
  });

  // An alumni request belongs to no organization, so there is no name to use.
  it("says alumni access instead when there is no organization", () => {
    const email = approved({ organization_name: null, request_type: "alumni" });
    expect(email.subject).toContain("alumni");
    expect(email.text).toContain("alumni access");
  });

  it("quotes the administrator's note when there is one", () => {
    const email = approved({
      decision_note: "Welcome aboard.",
      organization_name: "Orbit NTNU",
    });
    expect(email.text).toContain("Welcome aboard.");
  });

  it("says nothing about a note when there is none", () => {
    const email = approved({ decision_note: null, organization_name: "Orbit NTNU" });
    expect(email.text).not.toContain("wrote:");
  });

  // Whitespace is not a note. Rendering one would leave an empty quotation
  // under a sentence promising the administrator said something.
  it("treats a blank note as no note", () => {
    const email = approved({ decision_note: "   ", organization_name: "Orbit NTNU" });
    expect(email.text).not.toContain("wrote:");
  });
});

describe("a declined request", () => {
  // The profile is erased in the same transaction that queues this email, so
  // saying so is both true and the only thing that explains why signing in
  // will not work.
  it("says the profile was not kept", () => {
    const email = rejected({ organization_name: "Orbit NTNU" });
    expect(email.text).toContain("not kept a profile");
  });

  it("does not invite them to open a portal they cannot reach", () => {
    const email = rejected({ organization_name: "Orbit NTNU" });
    expect(email.html).not.toContain("Open the portal");
  });
});

describe("an ended membership", () => {
  // Not just "norstec.no" — the footer and every link already carry the
  // portal's own domain, so the warning has to be recognised by its sentence.
  const warning = "You sign in with your norstec.no account";

  it("warns about the sign-in when norstec.no is the only way in", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: true,
    });
    expect(email.text).toContain(warning);
    expect(email.text).toContain("Add a personal Google account");
    expect(email.html).toContain(`${site}/profile`);
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
    const email = membershipEnded({ organization_name: "Orbit NTNU" });
    expect(email.text).not.toContain(warning);
  });

  it("does not warn on a truthy string either", () => {
    const email = membershipEnded({
      organization_name: "Orbit NTNU",
      workspace_sign_in_only: "false",
    });
    expect(email.text).not.toContain(warning);
  });

  it("still says what it is about when the organization has no name", () => {
    const email = membershipEnded({ organization_name: null });
    expect(email.subject).toContain("NORSTEC");
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
