"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import type { PortalRole } from "@/lib/auth/types";

const mainNavigation = [
  { label: "Dashboard", href: "/" },
  { label: "Profile", href: "/profile" },
  { label: "Teams", href: "/teams" },
];

const adminNavigation = [
  { label: "Organization", href: "/organization" },
  { label: "Norstec admin", href: "/admin" },
];

function PortalMark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Image
        src="/images/logo.png"
        alt="Norstec"
        width={40}
        height={40}
        className={light ? "" : "portal-logo"}
        priority
      />
      <span className="leading-tight">
        <span className="block font-display text-xl tracking-wide">NORSTEC</span>
        <span className="block text-[0.62rem] font-medium uppercase tracking-[0.2em] opacity-55">Portal</span>
      </span>
    </span>
  );
}

function Navigation({
  role,
  onNavigate,
}: {
  role: PortalRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const link = ({ label, href }: { label: string; href: string }) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      className={`portal-nav-item ${pathname === href ? "portal-nav-item-active" : ""}`}
    >
      {label}
    </Link>
  );

  const visibleAdminNavigation = adminNavigation.filter(({ href }) => {
    if (href === "/admin") return role === "norstec_admin";
    return role === "organization_admin" || role === "norstec_admin";
  });

  return (
    <nav aria-label="Portal navigation" className="flex flex-col">
      <p className="section-label mb-2 px-3 opacity-45">Portal</p>
      {mainNavigation.map(link)}
      {visibleAdminNavigation.length > 0 && (
        <>
          <p className="section-label mb-2 mt-8 px-3 opacity-45">Administration</p>
          {visibleAdminNavigation.map(link)}
        </>
      )}
    </nav>
  );
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextLabel = resolvedTheme === "dark" ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex min-h-10 cursor-pointer items-center gap-2 px-2 text-sm transition-opacity hover:opacity-60"
      aria-label={nextLabel}
    >
      <span className="material-symbols-outlined text-[1.25rem]">
        {resolvedTheme === "dark" ? "light_mode" : "dark_mode"}
      </span>
      {!compact && nextLabel}
    </button>
  );
}

export function PortalShell({
  children,
  displayName,
  organizationName,
  role,
}: {
  children: React.ReactNode;
  displayName: string;
  organizationName: string;
  role: PortalRole;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-egg text-moody">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r-2 border-moody bg-egg lg:flex lg:flex-col">
        <Link href="/" className="px-7 py-7" aria-label="Portal dashboard"><PortalMark /></Link>
        <div className="norstec-stripes mb-10 px-7" aria-hidden="true">
          <span className="bg-copper" /><span className="bg-sun" /><span className="bg-beachball" /><span className="bg-sky" />
        </div>
        <div className="flex-1 px-4"><Navigation role={role} /></div>
        <div className="border-t-2 border-moody px-5 py-4">
          <p className="truncate px-2 text-sm font-medium">{displayName}</p>
          <p className="truncate px-2 text-xs opacity-50">{organizationName}</p>
          <div className="mt-3 flex items-center justify-between">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex size-10 items-center justify-center" aria-label="Sign out">
                <span className="material-symbols-outlined text-[1.25rem]">logout</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b-2 border-moody bg-egg px-5 lg:hidden">
        <Link href="/" aria-label="Portal dashboard"><PortalMark /></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button type="button" onClick={() => setMenuOpen(true)} className="flex size-10 items-center justify-center" aria-label="Open menu">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-moody text-egg lg:hidden">
          <div className="flex h-16 items-center justify-between border-b-2 border-egg px-5">
            <PortalMark light />
            <button type="button" onClick={() => setMenuOpen(false)} className="flex size-10 items-center justify-center" aria-label="Close menu">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="px-5 py-10"><Navigation role={role} onNavigate={() => setMenuOpen(false)} /></div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:px-12 lg:py-16">{children}</div>
      </main>
    </div>
  );
}
