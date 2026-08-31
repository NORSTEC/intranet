"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MemberAvatar } from "@/components/portal/member-avatar";
import {
  PORTAL_DEVELOPERS,
  type ResolvedDeveloper,
} from "@/lib/legal/developers";
import { getPortalDevelopers } from "@/lib/legal/get-developers";

/** The card body, shared so the linked and unlinked cards cannot drift apart. */
function DeveloperCardBody({
  developer,
  linked,
}: {
  developer: ResolvedDeveloper;
  linked: boolean;
}) {
  return (
    <>
      {/* A picture somebody set on their own profile wins: it is the one they
          chose, and it stays current without an edit here. The shipped
          portrait is what a signed-out visitor sees, and what fills in for a
          profile that has no avatar yet. */}
      <MemberAvatar
        name={developer.name}
        size="large"
        src={developer.avatarUrl ?? developer.photo}
      />
      {/* No `truncate`, unlike the dashboard's member cards: those sit in a
          grid the page sizes, these hold two known names and can afford to
          wrap rather than clip somebody's surname. */}
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-tight">
          {developer.name}
        </span>
        <span className="mt-1 block text-sm opacity-55">{developer.role}</span>
        {/* Plain text inside a linked card — an anchor nested in the card's
            own link is invalid, and the profile it opens carries its own
            contact buttons. Signed out there is no profile to reach, so the
            address becomes the one thing on the card you can act on. */}
        {linked ? (
          <span className="mt-1 block break-all text-sm opacity-55">
            {developer.email}
          </span>
        ) : (
          <a
            className="legal-link mt-1 block break-all text-sm opacity-55"
            href={`mailto:${developer.email}`}
          >
            {developer.email}
          </a>
        )}
      </span>
      {linked && (
        <span
          aria-hidden="true"
          className="material-symbols-outlined self-end transition-transform group-hover:translate-x-1"
        >
          trending_flat
        </span>
      )}
    </>
  );
}

/**
 * The footer's Developers entry: a trigger that looks like the links beside
 * it, and an informational dialog behind it. It is not a `ConfirmDialog` —
 * that one is an `alertdialog` with a confirm and a cancel, and nothing here
 * is being confirmed — but it borrows the same overlay and surface so the two
 * read as one component family.
 */
export function DevelopersDialog() {
  const [open, setOpen] = useState(false);
  const [developers, setDevelopers] =
    useState<ResolvedDeveloper[]>(PORTAL_DEVELOPERS);
  const [loaded, setLoaded] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;

    let cancelled = false;
    // The names and roles are already on screen from the static list, so this
    // only ever fills in a picture, an address and a link. Nothing is blocked
    // on it, and a failure leaves the cards exactly as they opened.
    getPortalDevelopers()
      .then((resolved) => {
        if (!cancelled) {
          setDevelopers(resolved);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loaded, open]);

  function close() {
    setOpen(false);
    // Sending focus back to the trigger, so closing with the keyboard does not
    // drop the caret at the top of the document.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        className="site-footer-link cursor-pointer opacity-65"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        Developers
      </button>

      {open && (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="dialog"
        >
          {/* `text-moody` explicitly: the trigger lives in a footer, and on
              the login page that footer sits in a column which pins its own
              foreground at every width from `lg` up. Without this the panel
              inherits that fixed dark text onto a dark surface. */}
          <div className="portal-surface max-h-[90vh] w-full max-w-lg overflow-y-auto p-7 text-left text-moody sm:p-8">
            <h2 className="text-2xl font-medium" id={titleId}>
              Developers
            </h2>

            <ul className="mt-6 grid gap-4">
              {developers.map((developer) => (
                <li className="flex" key={developer.name}>
                  {developer.personId === undefined ? (
                    <div className="portal-surface flex w-full items-center gap-4 p-4">
                      <DeveloperCardBody developer={developer} linked={false} />
                    </div>
                  ) : (
                    <Link
                      className="portal-surface portal-card-link group flex w-full items-center gap-4 p-4"
                      href={`/members/${developer.personId}`}
                    >
                      <DeveloperCardBody developer={developer} linked />
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            {/* The dialog is on the login page too, where Slack is not
                reachable and the address above is. Both are named, neither is
                linked twice: the cards already carry the mail links. */}
            <p className="mt-6 text-sm leading-relaxed opacity-65">
              Have a recommendation, or spotted a bug? Write to us at the
              addresses above, or send us a message on Slack.
            </p>

            <div className="mt-7 flex justify-end">
              <button
                className="portal-button"
                onClick={close}
                ref={closeRef}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  close
                </span>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
