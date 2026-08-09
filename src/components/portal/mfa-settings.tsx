"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { createClient } from "@/lib/supabase/client";

type VerifiedFactor = {
  id: string;
  friendlyName?: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function readableMfaError(message: string) {
  if (message.toLowerCase().includes("invalid")) {
    return "That code was not accepted. Wait for a new code and try again.";
  }
  if (message.toLowerCase().includes("expired")) {
    return "The setup expired. Start again to get a new QR code.";
  }
  return "The authenticator could not be updated. Try again.";
}

export function MfaSettings({ required }: { required: boolean }) {
  const router = useRouter();
  const [factor, setFactor] = useState<VerifiedFactor | null>(null);
  const [assuranceLevel, setAssuranceLevel] = useState<"aal1" | "aal2">(
    "aal1",
  );
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [busy, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [factorsResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (factorsResult.error || assuranceResult.error) {
      setError("Your security settings could not be loaded. Refresh the page.");
      setReady(true);
      return;
    }

    const verified = factorsResult.data.totp[0];
    setFactor(
      verified
        ? { id: verified.id, friendlyName: verified.friendly_name }
        : null,
    );
    setAssuranceLevel(
      assuranceResult.data.currentLevel === "aal2" ? "aal2" : "aal1",
    );
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function beginEnrollment() {
    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const factorsResult = await supabase.auth.mfa.listFactors();

      if (factorsResult.error) {
        setError(readableMfaError(factorsResult.error.message));
        return;
      }

      for (const existing of factorsResult.data.all) {
        if (
          existing.factor_type === "totp" &&
          existing.status !== "verified"
        ) {
          const removal = await supabase.auth.mfa.unenroll({
            factorId: existing.id,
          });
          if (removal.error) {
            setError(readableMfaError(removal.error.message));
            return;
          }
        }
      }

      const { data, error: enrollmentError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "NORSTEC portal",
        issuer: "NORSTEC",
      });

      if (enrollmentError) {
        setError(readableMfaError(enrollmentError.message));
        return;
      }

      const qrCode = data.totp.qr_code.startsWith("data:")
        ? data.totp.qr_code
        : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      setEnrollment({ factorId: data.id, qrCode, secret: data.totp.secret });
      setCode("");
    });
  }

  function verify() {
    const factorId = enrollment?.factorId ?? factor?.id;
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code shown in your authenticator app.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { error: verificationError } =
        await supabase.auth.mfa.challengeAndVerify({ factorId, code });

      if (verificationError) {
        setError(readableMfaError(verificationError.message));
        return;
      }

      setEnrollment(null);
      setCode("");
      await refresh();
      router.refresh();
    });
  }

  function removeFactor() {
    if (!factor) return;
    setConfirmRemoval(false);
    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { error: removalError } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });

      if (removalError) {
        setError(readableMfaError(removalError.message));
        return;
      }

      // An access token issued at AAL2 remains valid until it is replaced.
      // Refresh immediately so removing the factor also removes administrator
      // authorization from this browser session.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/login");
        router.refresh();
        return;
      }

      await refresh();
      router.refresh();
    });
  }

  if (!ready) {
    return (
      <div className="portal-surface p-6 sm:p-7" role="status">
        Loading security settings…
      </div>
    );
  }

  return (
    <>
      <section className="portal-surface p-6 sm:p-7">
        {required && assuranceLevel !== "aal2" && (
          <div className="mb-6 bg-copper/10 p-4 text-sm leading-relaxed">
            Confirm a code before returning to administration. This protects
            access decisions, member data, domains, and account changes.
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-h3">Authenticator app</h2>
            <p className="mt-3 max-w-[60ch] text-sm leading-relaxed opacity-60">
              Codes work offline in apps such as Google Authenticator, 1Password,
              or Microsoft Authenticator.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.15rem]"
            >
              {factor ? "verified_user" : "shield"}
            </span>
            {factor ? "Enabled" : "Not enabled"}
          </span>
        </div>

        {error && (
          <p className="mt-6 text-sm font-medium text-copper" role="alert">
            {error}
          </p>
        )}

        {!factor && !enrollment && (
          <button
            className="portal-button mt-7"
            disabled={busy}
            onClick={beginEnrollment}
            type="button"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              qr_code_2
            </span>
            {busy ? "Preparing…" : "Set up authenticator"}
          </button>
        )}

        {enrollment && (
          <div className="mt-8 border-t border-moody/20 pt-7">
            <h3 className="text-xl font-medium">Scan and confirm</h3>
            <div className="mt-5 grid gap-6 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
              <Image
                alt="QR code for the NORSTEC portal authenticator"
                className="rounded-xl bg-white p-3"
                height={192}
                src={enrollment.qrCode}
                unoptimized
                width={192}
              />
              <div>
                <p className="text-sm leading-relaxed opacity-65">
                  Scan the QR code. If scanning is unavailable, enter this key
                  manually:
                </p>
                <code className="mt-3 block break-all bg-moody/5 p-3 text-sm">
                  {enrollment.secret}
                </code>
                <CodeForm
                  busy={busy}
                  code={code}
                  label="Finish setup"
                  onChange={setCode}
                  onSubmit={verify}
                />
              </div>
            </div>
          </div>
        )}

        {factor && assuranceLevel === "aal1" && (
          <div className="mt-8 border-t border-moody/20 pt-7">
            <h3 className="text-xl font-medium">Confirm it is you</h3>
            <p className="mt-3 max-w-[60ch] text-sm leading-relaxed opacity-60">
              Enter a current code to unlock administrator actions for this
              session.
            </p>
            <CodeForm
              busy={busy}
              code={code}
              label="Verify session"
              onChange={setCode}
              onSubmit={verify}
            />
          </div>
        )}

        {factor && assuranceLevel === "aal2" && (
          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-moody/20 pt-7">
            <p className="mr-auto text-sm font-medium">
              This session is protected with two-step verification.
            </p>
            <button
              className="portal-button"
              disabled={busy}
              onClick={() => setConfirmRemoval(true)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[1.1rem]"
              >
                delete
              </span>
              Remove authenticator
            </button>
          </div>
        )}
      </section>

      {confirmRemoval && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="delete"
          confirmLabel="Remove authenticator"
          danger
          onCancel={() => setConfirmRemoval(false)}
          onConfirm={removeFactor}
          title="Remove two-step verification?"
        >
          Administrator actions will be locked until an authenticator is set
          up and confirmed again.
        </ConfirmDialog>
      )}
    </>
  );
}

function CodeForm({
  busy,
  code,
  label,
  onChange,
  onSubmit,
}: {
  busy: boolean;
  code: string;
  label: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-5 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="grid gap-2">
        <span className="section-label opacity-45">Six-digit code</span>
        <input
          autoComplete="one-time-code"
          className="portal-field w-40 tabular-nums"
          disabled={busy}
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          pattern="[0-9]{6}"
          required
          value={code}
        />
      </label>
      <button className="portal-button" disabled={busy} type="submit">
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[1.1rem]"
        >
          {busy ? "progress_activity" : "verified"}
        </span>
        {busy ? "Checking…" : label}
      </button>
    </form>
  );
}
