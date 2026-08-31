import { describe, expect, it } from "vitest";
import { deriveAccessLevel, derivePersonStatus } from "@/lib/portal/access-labels";

/**
 * These two functions decide what every list and every person page says about
 * somebody. Their own comments record that Manage people and the person page
 * once disagreed — an alumnus granted access without any membership row read
 * as "No membership" in one place and "Alumni" in the other. The rules moved
 * here so there would be one answer; these tests are what keeps it one.
 */

describe("deriveAccessLevel", () => {
  const base = {
    hasActiveMembership: false,
    hasAlumniAccess: false,
    hasEndedMembership: false,
    isOrganizationAdmin: false,
    isPortalAdmin: false,
    isSuspended: false,
  };

  it("puts suspension ahead of every role", () => {
    expect(
      deriveAccessLevel({
        ...base,
        hasActiveMembership: true,
        isOrganizationAdmin: true,
        isPortalAdmin: true,
        isSuspended: true,
      }),
    ).toBe("suspended");
  });

  it("ranks intranet admin above organization admin", () => {
    expect(
      deriveAccessLevel({
        ...base,
        isOrganizationAdmin: true,
        isPortalAdmin: true,
      }),
    ).toBe("portal_admin");
  });

  it("calls an organization admin an organization admin", () => {
    expect(
      deriveAccessLevel({ ...base, hasActiveMembership: true, isOrganizationAdmin: true }),
    ).toBe("organization_admin");
  });

  it("treats alumni access as member-level access", () => {
    // An alumnus reads the portal on exactly the terms a member does, so
    // anything narrower here would be a lie about what they can reach.
    expect(deriveAccessLevel({ ...base, hasAlumniAccess: true })).toBe("member");
  });

  it("gives a plain active member access", () => {
    expect(deriveAccessLevel({ ...base, hasActiveMembership: true })).toBe("member");
  });

  it("treats an ended membership as member-level access", () => {
    // The sign-in path admits `status in ('active', 'ended')`, so somebody
    // whose only membership has ended reads the portal exactly as a member
    // does. Manage people said "No access" about people who were signing in.
    expect(deriveAccessLevel({ ...base, hasEndedMembership: true })).toBe(
      "member",
    );
  });

  it("gives someone with neither membership nor alumni access nothing", () => {
    expect(deriveAccessLevel(base)).toBe("none");
  });
});

describe("derivePersonStatus", () => {
  const base = {
    activeMembershipCount: 0,
    deletedAt: null,
    endedMembershipCount: 0,
    hasAlumniAccess: false,
  };

  it("puts deletion ahead of everything else", () => {
    expect(
      derivePersonStatus({
        ...base,
        activeMembershipCount: 3,
        deletedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe("deleted");
  });

  it("counts one active membership as active, ended ones notwithstanding", () => {
    expect(
      derivePersonStatus({
        ...base,
        activeMembershipCount: 1,
        endedMembershipCount: 4,
      }),
    ).toBe("active");
  });

  it("calls someone whose only memberships have ended an alumnus", () => {
    expect(derivePersonStatus({ ...base, endedMembershipCount: 1 })).toBe("alumni");
  });

  it("calls someone with granted alumni access an alumnus with no membership at all", () => {
    // The regression this function was written to end: a portal administrator
    // can grant alumni access to somebody the portal never recorded a
    // membership for, and they are an alumnus, not a nobody.
    expect(derivePersonStatus({ ...base, hasAlumniAccess: true })).toBe("alumni");
  });

  it("says no membership when there is none", () => {
    expect(derivePersonStatus(base)).toBe("none");
  });
});
