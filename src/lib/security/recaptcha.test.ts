import { describe, expect, it, vi } from "vitest";
import { RECAPTCHA_ACTION } from "@/lib/security/recaptcha-constants";
import { verifyAccessRequestCaptcha } from "@/lib/security/recaptcha";

function response(body: object, ok = true) {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok,
  } as unknown as Response;
}

const configured = {
  nodeEnv: "production",
  secretKey: "secret-key",
  siteKey: "site-key",
};

describe("access request reCAPTCHA", () => {
  it("accepts a successful response for the expected action and score", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        action: RECAPTCHA_ACTION,
        score: 0.8,
        success: true,
      }),
    );

    await expect(
      verifyAccessRequestCaptcha("browser-token", { ...configured, fetcher }),
    ).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledWith(
      "https://www.recaptcha.net/recaptcha/api/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetcher.mock.calls[0][1].body.toString()).toContain(
      "response=browser-token",
    );
  });

  it.each([
    [{ success: false }, "failed"],
    [
      { action: "another_action", score: 0.9, success: true },
      "failed",
    ],
    [
      { action: RECAPTCHA_ACTION, score: 0.49, success: true },
      "failed",
    ],
  ])("rejects an invalid assessment", async (body, reason) => {
    const fetcher = vi.fn().mockResolvedValue(response(body));

    await expect(
      verifyAccessRequestCaptcha("browser-token", { ...configured, fetcher }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("fails closed when production credentials are incomplete", async () => {
    await expect(
      verifyAccessRequestCaptcha("browser-token", {
        nodeEnv: "production",
        secretKey: undefined,
        siteKey: "site-key",
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("allows credential-free local development", async () => {
    await expect(
      verifyAccessRequestCaptcha("", {
        nodeEnv: "development",
        secretKey: undefined,
        siteKey: undefined,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when Google cannot be reached", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      verifyAccessRequestCaptcha("browser-token", { ...configured, fetcher }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
