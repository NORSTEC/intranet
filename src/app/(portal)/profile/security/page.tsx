import { MfaSettings } from "@/components/portal/mfa-settings";
import { requirePortalAccess } from "@/lib/auth/access";

export default async function ProfileSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string }>;
}) {
  await requirePortalAccess();
  const { mfa } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-h2">Sign-in security</h1>
      <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
        Use an authenticator app to add a second check after Google sign-in.
        Administrator actions require this protection.
      </p>

      <div className="mt-10">
        <MfaSettings required={mfa === "required"} />
      </div>
    </div>
  );
}
