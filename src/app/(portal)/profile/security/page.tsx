import { MfaSettings } from "@/components/portal/mfa-settings";
import { requirePortalAccess } from "@/lib/auth/access";

export default async function ProfileSecurityPage() {
  await requirePortalAccess();

  return (
    <div>
      <h1 className="text-h2">Sign-in security</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
        Use an authenticator app to verify administrator actions. Google
        sign-in still opens the member portal; sensitive administration
        requires a current six-digit code.
      </p>

      <div className="mt-8">
        <MfaSettings />
      </div>
    </div>
  );
}
