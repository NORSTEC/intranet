import {
  AnimatedTagline,
  EggNorstecLogo,
  LoginStripes,
  MobileLoginHeader,
} from "@/components/login/login-visual";
import { GoogleSignInButton } from "@/components/login/google-sign-in-button";
import { SiteFooter } from "@/components/site-footer";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen bg-egg text-moody lg:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#0f1118] p-12 lg:flex lg:items-center lg:justify-center xl:p-20">
        <LoginStripes />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="flex items-center gap-7 xl:gap-9">
            <EggNorstecLogo />
            <div className="text-left">
              <p className="-ml-[0.06em] text-5xl font-light uppercase tracking-[0.16em] text-[#EDE8DA] xl:text-6xl">
                NORSTEC
              </p>
              <p className="mt-3 text-left text-base font-medium uppercase tracking-[0.46em] text-[#EDE8DA]/65">
                Portal
              </p>
            </div>
          </div>
          <div className="mt-12">
            <AnimatedTagline />
          </div>
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-egg px-5 py-8 text-moody transition-colors duration-200 sm:px-10 lg:bg-[#EDE8DA] lg:px-16 lg:text-[#0f1118] xl:px-24">
        <MobileLoginHeader />

        <div className="my-auto w-full max-w-md self-center py-16">
          <h1 className="flex items-center gap-2 text-4xl font-light uppercase sm:text-5xl">
            Sign in
            <span
              aria-hidden="true"
              className="login-heading-star inline-block shrink-0"
            />
          </h1>

          <GoogleSignInButton />
          {error === "oauth_callback" && (
            <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
              Google sign-in could not be completed. Please try again.
            </p>
          )}
          {error === "authorization" && (
            <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
              Portal access could not be checked. Please try again.
            </p>
          )}
          {error === "deleted" && (
            <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
              This account has been deleted and is erased permanently 30 days after the deletion. Email portal@norstec.no before then if you want it back.
            </p>
          )}
          {error === "suspended" && (
            <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
              This portal account is suspended. Contact NORSTEC IT for help.
            </p>
          )}
          {error === "account_unlinked" && (
            <p className="mt-3 text-sm" role="status">
              That Google account was removed from your profile, so you were signed out. Sign in with your other account to continue.
            </p>
          )}

          {/* GDPR article 13 wants this at the moment the data is collected,
              and the collection starts on the next click: finishing Google
              sign-in creates a profile whether or not access is ever
              requested. It is a notice, not a consent — the processing rests
              on article 6(1)(b), so there is nothing here to tick. */}
          <p className="mt-5 text-sm leading-relaxed opacity-55">
            Signing in creates a portal profile from the name and email address
            on your Google account, before you request anything. If you never
            request access, it is deleted automatically after 30 days.{" "}
            <a
              className="legal-link"
              href="/privacy"
              rel="noreferrer"
              target="_blank"
            >
              Read the privacy policy
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>

          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-50">Which account should I use?</p>
            <ol className="mt-5 space-y-5">
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">domain</span>
                <div><p className="text-sm font-medium">Organization account</p><p className="mt-1 text-sm leading-5 opacity-55">Use the Google account provided by a NORSTEC member organization. On first sign-in, you can connect it to an existing portal profile or create a new one.</p></div>
              </li>
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">person</span>
                <div><p className="text-sm font-medium">Personal account</p><p className="mt-1 text-sm leading-5 opacity-55">You can sign in with a personal Google account and request access, or use one already connected to your profile.</p></div>
              </li>
            </ol>
          </div>
        </div>

        <SiteFooter contentClassName="" />
      </section>
    </main>
  );
}
