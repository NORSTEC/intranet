import type { ReactNode } from "react";

/**
 * One administrative decision, with the sentence explaining what it does above
 * the control that does it. Shared rather than local to one panel: the person
 * page renders several of these side by side and they have to line up.
 */
export function ActionCard({
  children,
  description,
  title,
  tone = "default",
}: {
  children: ReactNode;
  description: string;
  title: string;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={`portal-surface flex flex-col p-6 sm:p-7${
        tone === "danger" ? " border-copper" : ""
      }`}
    >
      <h3 className="text-h3">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-60">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
