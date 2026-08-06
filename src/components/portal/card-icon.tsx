import { SlackIcon } from "@/components/portal/slack-icon";

/**
 * A sentinel rather than a real Material Symbols name: Slack has no glyph in
 * that font, so its cards render an SVG mark instead of the icon span every
 * other card uses.
 */
export const SLACK_ICON = "slack-brand";

/**
 * The oversized mark at the top of a section or action card. Both variants
 * occupy the same 5.5rem box — the Material Symbols glyph gets that height from
 * its own line box, and the Slack mark is centred inside a box of the same
 * height — so the heading below every card in a grid sits on the same line.
 */
export function CardIcon({ icon }: { icon: string }) {
  if (icon === SLACK_ICON) {
    return (
      <span className="flex h-[5.5rem] items-center">
        {/* Sized to the cap height of the Material Symbols glyphs beside it
            rather than to their font size, which includes leading the mark does
            not have. */}
        <SlackIcon className="size-[4.25rem]" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      // Google's own `.material-symbols-outlined` rule is unlayered and
      // therefore beats Tailwind's layered utilities, so the size has to be
      // marked important to apply at all.
      className="material-symbols-outlined text-[5.5rem]! leading-none"
    >
      {icon}
    </span>
  );
}
