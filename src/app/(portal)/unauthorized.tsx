import { MfaSettings } from "@/components/portal/mfa-settings";

/**
 * The two-step challenge, rendered where the administrator page would have
 * been. `unauthorized()` interrupts that page's render without a navigation,
 * so the address bar still holds the page that was asked for and confirming a
 * code re-renders it in place.
 */
export default function PortalUnauthorized() {
  return (
    <div>
      <h1 className="text-h2">Confirm it is you</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
        Administration needs a current six-digit code from your authenticator
        app. Enter one to open this page.
      </p>

      <div className="mt-8">
        <MfaSettings required />
      </div>
    </div>
  );
}
