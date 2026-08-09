import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/security/content-security-policy";

describe("content security policy", () => {
  it("uses a per-request script nonce without production inline-script escape hatches", () => {
    const policy = contentSecurityPolicy({
      development: false,
      nonce: "request-nonce",
      supabaseOrigin: "https://project.supabase.co",
    });

    expect(policy).toContain(
      "script-src 'self' 'nonce-request-nonce' 'strict-dynamic'",
    );
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  });

  it("allows only the resources reCAPTCHA needs", () => {
    const policy = contentSecurityPolicy({
      development: false,
      nonce: "request-nonce",
      supabaseOrigin: "https://project.supabase.co",
    });

    expect(policy).toContain("https://www.recaptcha.net/recaptcha/");
    expect(policy).toContain("https://www.gstatic.com/recaptcha/");
    expect(policy).toContain(
      "frame-src https://www.recaptcha.net/recaptcha/ https://recaptcha.google.com/recaptcha/",
    );
    expect(policy.match(/connect-src[^;]*/)?.[0]).toContain(
      "https://www.recaptcha.net",
    );
  });

  it("allows the configured Supabase HTTP and realtime origins", () => {
    const policy = contentSecurityPolicy({
      development: false,
      nonce: "request-nonce",
      supabaseOrigin: "https://project.supabase.co",
    });

    expect(policy).toContain("https://project.supabase.co");
    expect(policy).toContain("wss://project.supabase.co");
  });

  it("keeps React's development evaluator out of production only", () => {
    const policy = contentSecurityPolicy({
      development: true,
      nonce: "request-nonce",
      supabaseOrigin: "",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("connect-src 'self'  ");
  });
});
