import { describe, expect, it } from "vitest";
import { hasNorstecEmail } from "@/lib/portal/norstec";

/**
 * This decides who may be offered the portal administrator role. The database
 * refuses anyone else regardless — `set_portal_administrator` checks the same
 * domain — so a mistake here shows a button that cannot work rather than
 * granting anything. Still worth being exact about, because "ends with
 * norstec.no" and "is at norstec.no" are not the same test, and the first one
 * lets `norstec.no.example.com` through.
 */
describe("hasNorstecEmail", () => {
  it("accepts an address in the domain", () => {
    expect(hasNorstecEmail(["someone@norstec.no"])).toBe(true);
  });

  it("ignores case", () => {
    expect(hasNorstecEmail(["Someone@NORSTEC.no"])).toBe(true);
  });

  it("finds one among several", () => {
    expect(
      hasNorstecEmail(["private@gmail.com", "someone@norstec.no"]),
    ).toBe(true);
  });

  it("rejects a lookalike domain that merely ends the same way", () => {
    expect(hasNorstecEmail(["someone@notnorstec.no"])).toBe(false);
  });

  it("rejects a domain that only starts the same way", () => {
    expect(hasNorstecEmail(["someone@norstec.no.example.com"])).toBe(false);
  });

  it("rejects a subdomain", () => {
    expect(hasNorstecEmail(["someone@mail.norstec.no"])).toBe(false);
  });

  it("rejects an address with the domain in the local part", () => {
    expect(hasNorstecEmail(["norstec.no@gmail.com"])).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(hasNorstecEmail([])).toBe(false);
  });
});
