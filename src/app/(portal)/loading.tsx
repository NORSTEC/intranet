/**
 * Shown while the page below the intranet shell is still being rendered.
 *
 * Without this file the App Router has nowhere to stream into, so a click on a
 * navigation link does nothing visible until the whole server render finishes —
 * the address bar does not move, the old page stays put, and the only signal
 * that anything happened is that the intranet has stopped responding. Every
 * intranet page resolves the signed-in person before it can ask for anything
 * else, so that wait is never zero.
 *
 * The shapes below are deliberately generic. A skeleton that mimics one page's
 * layout is wrong on every other page in the group, and a wrong guess reads
 * worse than an honest block.
 */
export default function PortalLoading() {
  return (
    <div aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading…</span>
      <div className="animate-pulse">
        <div className="h-9 w-64 max-w-full rounded bg-moody/10" />
        <div className="mt-4 h-4 w-96 max-w-full rounded bg-moody/10" />
        <div className="mt-9 space-y-4">
          <div className="h-28 rounded-xl bg-moody/5" />
          <div className="h-28 rounded-xl bg-moody/5" />
          <div className="h-28 rounded-xl bg-moody/5" />
        </div>
      </div>
    </div>
  );
}
