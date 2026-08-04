/**
 * Marks the signed-in person's own row. Beachball rather than the default
 * outline so the eye finds it without reading — the same treatment the
 * primary sign-in account gets.
 */
export function YouPill() {
  return (
    <span className="portal-pill border-beachball bg-beachball text-moody-static">
      You
    </span>
  );
}
