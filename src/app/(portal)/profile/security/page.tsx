import { MfaSettings } from "@/components/portal/mfa-settings";
import { requirePortalAccess } from "@/lib/auth/access";
import { safePortalReturnPath } from "@/lib/auth/return-path";

export default async function ProfileSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; returnTo?: string }>;
}) {
  await requirePortalAccess();
  const { mfa, returnTo } = await searchParams;
  const required = mfa === "required";

  return (
    <div>
      <h1 className="text-h2">Sign-in security</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
        Use an authenticator app to verify administrator actions. Google
        sign-in still opens the member intranet; sensitive administration
        requires a current six-digit code.
      </p>

      <div className="mt-8">
        <MfaSettings
          required={required}
          returnTo={required ? safePortalReturnPath(returnTo) : null}
        />
      </div>
    </div>
  );
}
