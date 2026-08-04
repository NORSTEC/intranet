import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/portal/portal-shell";

export function PortalEntryShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-egg text-moody">
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

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button aria-label="Use another account" className="portal-button" type="submit">
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                  logout
                </span>
                <span className="hidden sm:inline">Use another account</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[100rem] px-5 py-12 sm:px-8 lg:px-16 lg:py-20 xl:px-20 2xl:px-28">
        {children}
      </main>
    </div>
  );
}
