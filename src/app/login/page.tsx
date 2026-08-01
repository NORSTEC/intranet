import Link from "next/link";
import {
  AnimatedTagline,
  EggNorstecLogo,
  LoginStripes,
} from "@/components/login/login-visual";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[#EDE8DA] text-[#0f1118] lg:grid-cols-2">
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

      <section className="flex min-h-screen flex-col bg-[#EDE8DA] px-5 py-8 sm:px-10 lg:px-16 xl:px-24">
        <div className="flex items-center gap-4 lg:hidden">
          <div className="size-11 bg-[#0f1118] [mask:url('/images/logo.png')_center/contain_no-repeat]" aria-hidden="true" />
          <div>
            <p className="-ml-[0.06em] text-xl font-light uppercase tracking-[0.14em]">Norstec</p>
            <p className="mt-0.5 text-left text-xs font-medium uppercase tracking-[0.34em] opacity-55">Portal</p>
          </div>
        </div>

        <div className="my-auto w-full max-w-md self-center py-16">
          <h1 className="flex items-center gap-2 text-4xl font-light uppercase sm:text-5xl">
            Sign in
            <span
              aria-hidden="true"
              className="inline-block size-6 shrink-0 bg-[url('/images/star.svg')] bg-contain bg-center bg-no-repeat md:size-8"
            />
          </h1>

          <Link href="/" className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-2 border-[#0f1118] bg-[#0f1118] px-5 font-medium text-[#EDE8DA] transition-colors hover:bg-transparent hover:text-[#0f1118]">
            Continue with Google
            <span className="material-symbols-outlined">arrow_right_alt</span>
          </Link>

          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-50">Which account should I use?</p>
            <ol className="mt-5 space-y-5">
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">domain</span>
                <div><p className="text-sm font-medium">Organization account</p><p className="mt-1 text-sm leading-5 opacity-55">Use the Google account provided by a Norstec member organization. Approved organization accounts get direct access.</p></div>
              </li>
              <li className="flex gap-4">
                <span className="material-symbols-outlined mt-0.5 text-[1.3rem]">person_add</span>
                <div><p className="text-sm font-medium">Personal account</p><p className="mt-1 text-sm leading-5 opacity-55">Use your personal Google account if your organization does not provide one, or if you are an alumnus. You can request access after signing in.</p></div>
              </li>
            </ol>
          </div>
        </div>
      </section>
    </main>
  );
}
