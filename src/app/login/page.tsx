import {
  AnimatedTagline,
  EggNorstecLogo,
  LoginStripes,
  MobileLoginHeader,
} from "@/components/login/login-visual";
import { GoogleSignInButton } from "@/components/login/google-sign-in-button";

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
                Norstec
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

          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-50">Which account should I use?</p>
            <ol className="mt-5 space-y-5">
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">domain</span>
                <div><p className="text-sm font-medium">Organization account</p><p className="mt-1 text-sm leading-5 opacity-55">Use the Google account provided by a Norstec member organization. Approved organization accounts get direct access.</p></div>
              </li>
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">person</span>
                <div><p className="text-sm font-medium">Personal account</p><p className="mt-1 text-sm leading-5 opacity-55">Use your personal Google account if your organization does not provide one, or if you are an alumnus. You can request access after signing in.</p></div>
              </li>
            </ol>
          </div>
        </div>
      </section>
    </main>
  );
}
