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
    "/profile/security?mfa=required",
    null,
  ])("rejects unsafe or looping destination %s", (destination) => {
    expect(safePortalReturnPath(destination)).toBeNull();
  });
});
