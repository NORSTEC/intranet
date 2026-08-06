import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/portal/portal-shell";
import { SiteFooter } from "@/components/site-footer";

/**
 * The chrome for public legal pages. It deliberately carries no sign-out
 * button and reads no session: the privacy policy has to be readable by
 * somebody who has not signed in and never will, which is exactly the reader
 * article 13 is written for.
 */
export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-egg text-moody">
      <header className="border-b border-moody">
        <div className="mx-auto flex h-24 w-full max-w-[100rem] items-center justify-between px-5 sm:px-8 lg:px-16 xl:px-20 2xl:px-28">
          <Link
            aria-label="NORSTEC portal"
            className="inline-flex w-fit items-center gap-4"
            href="/"
          >
            <span className="portal-sidebar-brand-wrap" aria-hidden="true">
              <span className="portal-sidebar-brand-mark" />
              <Image
                alt=""
                className="portal-sidebar-brand-color object-contain"
                fill
                priority
                src="/images/logo.png"
              />
            </span>
            <span>
              <span className="relative -left-px block font-display text-xl font-light uppercase tracking-[0.14em]">
                NORSTEC
              </span>
              <span className="mt-0.5 block text-xs font-medium uppercase tracking-[0.34em] opacity-55">
                Portal
              </span>
            </span>
          </Link>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-5 py-12 sm:px-8 lg:px-16 lg:py-20 xl:px-20 2xl:px-28">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
