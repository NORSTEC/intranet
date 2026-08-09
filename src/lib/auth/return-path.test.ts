import { describe, expect, it } from "vitest";
import { safePortalReturnPath } from "@/lib/auth/return-path";

describe("administrator MFA return path", () => {
  it("keeps an internal route and its query string", () => {
    expect(safePortalReturnPath("/admin/people?page=2")).toBe(
      "/admin/people?page=2",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/\\/attacker.example",
    "/profile/security",
    "/profile/security/",
    "/profile/security?mfa=required",
    null,
  ])("rejects unsafe or looping destination %s", (destination) => {
    expect(safePortalReturnPath(destination)).toBeNull();
  });

  it("keeps a hash fragment on an internal destination", () => {
    expect(safePortalReturnPath("/admin/people#row-4")).toBe(
      "/admin/people#row-4",
    );
  });
});
