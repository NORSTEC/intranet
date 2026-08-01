"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HamburgerSpin } from "@/components/portal/hamburger-spin";
import { PortalLogoToggle } from "@/components/portal/portal-logo-toggle";
import { useTheme } from "@/hooks/use-theme";
import type { PortalRole } from "@/lib/auth/types";

type NavigationItem = {
  label: string;
  href: string;
  icon: string;
  nested?: boolean;
  admin?: "organization" | "norstec";
};

const navigationGroups: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Portal",
    items: [
      { label: "Dashboard", href: "/", icon: "dashboard" },
      { label: "Organizations", href: "/organizations", icon: "domain", nested: true },
      { label: "Members", href: "/members", icon: "groups" },
      { label: "Statistics", href: "/statistics", icon: "monitoring" },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My profile", href: "/profile", icon: "person" }],
  },
  {
    label: "Administration",
    items: [
      { label: "Access requests", href: "/administration/access-requests", icon: "person_check", admin: "organization" },
      { label: "Member status", href: "/administration/members", icon: "manage_accounts", admin: "organization" },
      { label: "Organization settings", href: "/administration/organization", icon: "settings", admin: "organization" },
      { label: "Team management", href: "/administration/teams", icon: "group_work", admin: "organization" },
    ],
  },
  {
    label: "Norstec administration",
    items: [
      { label: "Portal management", href: "/admin", icon: "admin_panel_settings", admin: "norstec" },
      { label: "Audit log", href: "/admin/audit-log", icon: "history", admin: "norstec" },
    ],
  },
];

const breadcrumbLabels: Record<string, string> = {
  admin: "Portal management",
  administration: "Administration",
  "access-requests": "Access requests",
  "audit-log": "Audit log",
  members: "Members",
  organization: "Organization",
  organizations: "Organizations",
  profile: "Profile",
  statistics: "Statistics",
  teams: "Teams",
};

function isActiveNavigationItem(pathname: string, href: string, nested?: boolean) {
  if (href === "/") return pathname === href;
  return pathname === href || Boolean(nested && pathname.startsWith(`${href}/`));
}

function Navigation({
  role,
  onNavigate,
  collapsed = false,
  desktop = false,
}: {
  role: PortalRole;
  onNavigate?: () => void;
  collapsed?: boolean;
  desktop?: boolean;
}) {
  const pathname = usePathname();
  const isNorstecAdmin = role === "norstec_admin";
  const canAdministerOrganization = role === "organization_admin" || isNorstecAdmin;
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(({ admin }) => {
        if (admin === "norstec") return isNorstecAdmin;
        if (admin === "organization") return canAdministerOrganization;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  if (desktop) {
    if (collapsed) {
      return (
        <nav aria-label="Portal navigation" className="flex flex-col gap-2.5">
          {groups.flatMap((group) =>
            group.items.map(({ label, href, icon, nested }) => {
              const isActive = isActiveNavigationItem(pathname, href, nested);

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  title={label}
                  className={`portal-menu-link portal-menu-link-collapsed ${isActive ? "portal-menu-link-active" : ""}`}
                >
                  <span className="material-symbols-outlined text-[1.35rem]" aria-hidden="true">
                    {icon}
                  </span>
                </Link>
              );
            }),
          )}
        </nav>
      );
    }

    return (
      <nav aria-label="Portal navigation" className="space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="portal-nav-group-title">{group.label}</p>
            <div className="mt-3 flex flex-col gap-1">
              {group.items.map(({ label, href, icon, nested }) => {
                const isActive = isActiveNavigationItem(pathname, href, nested);

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`portal-menu-link portal-menu-link-desktop ${isActive ? "portal-menu-link-active" : ""}`}
                  >
                    <span className="material-symbols-outlined shrink-0 text-[1.35rem]" aria-hidden="true">
                      {icon}
                    </span>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Portal navigation" className="space-y-7">
      {groups.map((group) => (
        <div key={group.label}>
          <p className={`portal-nav-group-title whitespace-nowrap transition-opacity duration-150 ${collapsed ? "opacity-0" : ""}`}>
            {group.label}
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {group.items.map(({ label, href, nested }) => {
              const isActive = isActiveNavigationItem(pathname, href, nested);

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={`portal-menu-link ${collapsed ? "portal-menu-link-collapsed" : ""} ${isActive ? "portal-menu-link-active" : ""}`}
                >
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function ThemeToggle({
  menuOpen = false,
  inheritColor = false,
  outlined = false,
  showLabel = false,
  collapsed = false,
}: {
  menuOpen?: boolean;
  compact?: boolean;
  inheritColor?: boolean;
  outlined?: boolean;
  showLabel?: boolean;
  collapsed?: boolean;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextLabel = resolvedTheme === "dark" ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex cursor-pointer items-center rounded-full ${outlined && showLabel ? "" : "transition-colors duration-200"} ${
        outlined
          ? `portal-account-button ${showLabel ? `portal-sidebar-action portal-sidebar-action-theme ${collapsed ? "portal-sidebar-action-collapsed" : ""}` : "h-11 w-11 justify-center"}`
          : "h-8 w-8 justify-center"
      } ${
        inheritColor
          ? ""
          : menuOpen || resolvedTheme === "dark"
            ? "text-egg-static"
            : "text-moody"
      }`}
      aria-label={nextLabel}
    >
      <span className="material-symbols-outlined text-[1.5rem]">
        {resolvedTheme === "dark" ? "light_mode" : "dark_mode"}
      </span>
      {showLabel && (
        <span className={`portal-sidebar-action-label ${collapsed ? "opacity-0" : "opacity-100"}`}>
          {nextLabel}
        </span>
      )}
    </button>
  );
}

function AccountSummary({
  displayName,
  organizationName,
  showTheme = false,
  collapsed = false,
}: {
  displayName: string;
  organizationName: string;
  showTheme?: boolean;
  collapsed?: boolean;
}) {
  return (
    <div
      className="space-y-4"
      aria-label={`Signed in to ${organizationName}`}
    >
      <div
        className={`h-10 w-48 shrink-0 overflow-hidden whitespace-nowrap transition-opacity duration-150 ${
          collapsed ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="portal-nav-group-title">Signed in as</p>
        <p className="mt-1 truncate whitespace-nowrap text-sm font-semibold">{displayName}</p>
      </div>
      <div className="flex flex-col items-start gap-2.5">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className={`portal-account-button portal-sidebar-action portal-sidebar-action-signout ${collapsed ? "portal-sidebar-action-collapsed" : ""}`}
            aria-label="Sign out"
            title={collapsed ? "Sign out" : undefined}
          >
            <span className="material-symbols-outlined text-[1.15rem]">logout</span>
            <span className={`portal-sidebar-action-label ${collapsed ? "opacity-0" : "opacity-100"}`}>
              Sign out
            </span>
          </button>
        </form>
        {showTheme && <ThemeToggle inheritColor outlined showLabel collapsed={collapsed} />}
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.flatMap((segment, index) => {
    const isTeamCollectionSegment =
      segment === "teams" && segments[0] === "organizations" && index === 2;
    if (isTeamCollectionSegment) return [];

    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const decoded = decodeURIComponent(segment).replaceAll("-", " ");
    const label =
      breadcrumbLabels[segment] ??
      decoded.replace(/\b\w/g, (letter) => letter.toUpperCase());
    return [{ href, label }];
  });

  if (segments.length === 0) {
    crumbs.push({ href: "/", label: "Dashboard" });
  }

  return (
    <nav aria-label="Breadcrumb" className="portal-breadcrumbs">
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <li key={`${crumb.href}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="opacity-35">/</span>}
              {isCurrent ? (
                <span aria-current="page" className="text-moody">{crumb.label}</span>
              ) : (
                <Link href={crumb.href}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DesktopSidebar({
  displayName,
  organizationName,
  role,
  collapsed,
  onToggle,
}: {
  displayName: string;
  organizationName: string;
  role: PortalRole;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`portal-sidebar fixed inset-y-0 left-0 z-40 hidden overflow-visible lg:block ${
        collapsed ? "w-24" : "w-64"
      }`}
    >
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden px-[1.625rem] py-8">
        <div className="flex items-center">
          <Link href="/" className="inline-flex w-fit items-center gap-4" aria-label="Portal dashboard">
            <span className="portal-sidebar-brand-wrap" aria-hidden="true">
              <span className="portal-sidebar-brand-mark" />
              <Image
                src="/images/logo.png"
                alt=""
                fill
                priority
                className="portal-sidebar-brand-color object-contain"
              />
            </span>
              <span className={`whitespace-nowrap transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}>
                <span className="block font-display text-xl font-light uppercase tracking-[0.14em]">
                  Norstec
                </span>
                <span className="mt-0.5 block text-xs font-medium uppercase tracking-[0.34em] opacity-55">
                  Portal
                </span>
              </span>
          </Link>
        </div>

        <div className="portal-sidebar-navigation mt-10 min-h-0 flex-1 overflow-y-auto">
          <Navigation role={role} collapsed={collapsed} desktop />
        </div>

        <div className="mt-auto pb-1">
          <AccountSummary
            displayName={displayName}
            organizationName={organizationName}
            showTheme
            collapsed={collapsed}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`portal-sidebar-toggle absolute top-[2.1875rem] z-20 translate-x-1/2 ${
          collapsed ? "portal-sidebar-toggle-collapsed" : ""
        }`}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <span className="material-symbols-outlined text-[1.35rem]">
          {collapsed ? "left_panel_open" : "left_panel_close"}
        </span>
      </button>
    </aside>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const controlsLight = menuOpen || resolvedTheme === "dark";
  const mobilePanelTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.9 };

  return (
    <div className="min-h-screen bg-egg text-moody">
      <DesktopSidebar
        displayName={displayName}
        organizationName={organizationName}
        role={role}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      <header className="fixed inset-x-0 top-0 z-50 overflow-hidden bg-egg lg:hidden">
        <motion.div
          className="absolute inset-0 bg-moody-static"
          initial={false}
          animate={{ x: menuOpen ? 0 : "-110%" }}
          transition={mobilePanelTransition}
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto w-full px-5">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="inline-flex items-center" aria-label="Portal dashboard">
              <PortalLogoToggle open={menuOpen} />
              <span
                className={`ml-3 text-xs font-medium uppercase tracking-[0.34em] transition-colors duration-200 ${
                  controlsLight ? "text-egg-static" : "text-moody"
                }`}
              >
                Portal
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <ThemeToggle menuOpen={menuOpen} />
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className={`inline-flex cursor-pointer items-center gap-3 transition-colors duration-200 ${
                  controlsLight ? "text-egg-static" : "text-moody"
                }`}
                aria-expanded={menuOpen}
                aria-controls="portal-menu"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
              >
                <HamburgerSpin
                  open={menuOpen}
                  lineClassName={controlsLight ? "bg-egg-static" : "bg-moody"}
                  lineClassNameActive="bg-egg-static"
                  thickness={2}
                  gap={5}
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      <motion.aside
        id="portal-menu"
        className="fixed inset-0 z-40 lg:hidden"
        initial={false}
        animate={{ pointerEvents: menuOpen ? "auto" : "none" }}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <motion.div
          className="absolute inset-0 h-dvh overflow-y-auto bg-moody-static px-5 text-egg-static"
          initial={false}
          animate={{ x: menuOpen ? 0 : "-110%" }}
          transition={mobilePanelTransition}
        >
          <div className="flex min-h-dvh flex-col pb-7 pt-24">
            <Navigation role={role} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto pt-12">
              <AccountSummary displayName={displayName} organizationName={organizationName} />
            </div>
          </div>
        </motion.div>
      </motion.aside>

      <main
        className={`relative min-h-screen overflow-hidden pt-16 transition-[margin] duration-300 lg:pt-0 ${
          sidebarCollapsed ? "lg:ml-24" : "lg:ml-64"
        }`}
      >
        <div className="relative z-10 mx-auto w-full max-w-[100rem] px-5 py-12 sm:px-8 lg:px-16 lg:py-20 xl:px-20 2xl:px-28">
          <Breadcrumbs />
          {children}
        </div>
      </main>
    </div>
  );
}
