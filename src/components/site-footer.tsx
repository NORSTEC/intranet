import { DevelopersDialog } from "@/components/legal/developers-dialog";

/**
 * The one footer every surface uses — portal pages, the entry pages, the login
 * page and the privacy policy itself. GDPR article 12 wants the privacy
 * information "easily accessible", which in practice means reachable from
 * wherever the person happens to be, including before they sign in.
 *
 * The policy opens in a new tab rather than navigating: it is reference
 * material, and somebody reading it halfway through an access request should
 * not lose the form they had filled in.
 *
 * `contentClassName` exists because the footer meets two different page
 * widths: the portal's `max-w-[100rem]` gutter and the login page's narrow
 * right-hand column, which brings its own padding. The rule itself always
 * spans the full width of whatever it is placed in.
 */
export function SiteFooter({
  contentClassName = "mx-auto w-full max-w-[100rem] px-5 sm:px-8 lg:px-16 xl:px-20 2xl:px-28",
}: {
  contentClassName?: string;
}) {
  return (
    <footer>
      <div
        className={`flex flex-col gap-3 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${contentClassName}`}
      >
        <p className="opacity-65">© {new Date().getFullYear()} NORSTEC</p>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <li>
              <a
                className="site-footer-link opacity-65"
                href="/privacy"
                rel="noreferrer"
                target="_blank"
              >
                Privacy policy
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <DevelopersDialog />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
