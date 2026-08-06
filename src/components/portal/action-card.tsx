import type { ReactNode } from "react";

/**
 * One administrative decision, with the sentence explaining what it does above
 * the control that does it. Shared rather than local to one panel: the person
 * page renders several of these side by side and they have to line up.
 */
export function ActionCard({
  children,
  description,
  span = "one",
  title,
  tone = "default",
}: {
  children: ReactNode;
  description: string;
  /** `full` makes the card take the whole row of a two-column grid. */
  span?: "one" | "full";
  title: string;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={`portal-surface flex flex-col p-6 sm:p-7${
        tone === "danger" ? " border-copper" : ""
      }${span === "full" ? " xl:col-span-2" : ""}`}
    >
      <h3 className="text-h3">{title}</h3>
      {/* The description takes the slack, so cards sharing a grid row end up
          the same height with their controls on the same line. */}
      <p className="mt-2 flex-1 text-sm leading-relaxed opacity-60">
        {description}
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
