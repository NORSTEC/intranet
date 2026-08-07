import { describe, expect, it } from "vitest";
import {
  slackAccountType,
  slackAccountTypeRank,
  slackAccountTypes,
} from "@/lib/slack/account-type";

describe("slackAccountType", () => {
  it("reports a plain member", () => {
    expect(
      slackAccountType({ guestType: null, workspaceRole: "member" }),
    ).toBe("member");
  });

  it("separates the two kinds of guest", () => {
    expect(
      slackAccountType({ guestType: "single_channel", workspaceRole: "member" }),
    ).toBe("single_channel_guest");
    expect(
      slackAccountType({ guestType: "multi_channel", workspaceRole: "member" }),
    ).toBe("multi_channel_guest");
  });

  it("reports owners and admins", () => {
    expect(
      slackAccountType({ guestType: null, workspaceRole: "owner" }),
    ).toBe("owner");
    expect(
      slackAccountType({ guestType: null, workspaceRole: "admin" }),
    ).toBe("workspace_admin");
  });

  // Reporting somebody as a guest when they administer the workspace would
  // hide the fact that actually matters about the row.
  it("puts the role ahead of guest status when both are set", () => {
    expect(
      slackAccountType({ guestType: "multi_channel", workspaceRole: "owner" }),
    ).toBe("owner");
    expect(
      slackAccountType({ guestType: "single_channel", workspaceRole: "admin" }),
    ).toBe("workspace_admin");
  });
});

describe("slackAccountTypeRank", () => {
  it("sorts owners first and plain members last", () => {
    const ranked = [
      { guestType: null, workspaceRole: "member" } as const,
      { guestType: null, workspaceRole: "owner" } as const,
      { guestType: "single_channel", workspaceRole: "member" } as const,
      { guestType: null, workspaceRole: "admin" } as const,
    ]
      .sort((left, right) =>
        slackAccountTypeRank(left).localeCompare(slackAccountTypeRank(right)),
      )
      .map(slackAccountType);

    expect(ranked).toEqual([
      "owner",
      "workspace_admin",
      "single_channel_guest",
      "member",
    ]);
  });

  // The rank is a string index, so it stays sortable only while the list is
  // short enough that "10" cannot appear beside "2".
  it("keeps the type list short enough for a single-digit rank", () => {
    expect(slackAccountTypes.length).toBeLessThan(10);
  });
});
