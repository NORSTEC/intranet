"use client";

import { useEffect, useState } from "react";

export type LegalSection = { id: string; title: string };

/**
 * The contents list for a legal page, with the section currently being read
 * marked. It reads positions on scroll rather than using an
 * IntersectionObserver: the question here is "which heading did I last pass",
 * not "what is on screen", and a tall section with nothing else visible
 * answers the second one wrong.
 */
export function LegalTableOfContents({
  className,
  sections,
}: {
  className?: string;
  sections: readonly LegalSection[];
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const headings = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (headings.length === 0) return;

    let frame = 0;

    function update() {
      frame = 0;

      // A quarter down the viewport, so a heading counts as "reached" once it
      // has settled into reading position rather than the moment it appears.
      const readingLine = window.innerHeight * 0.25;
      let current = headings[0];

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= readingLine) {
          current = heading;
        }
      }

      // The last sections are usually short enough that they never reach the
      // reading line before the page runs out of scroll. At the bottom, the
      // last one is what you are looking at.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      ) {
        current = headings[headings.length - 1];
      }

      setActiveId(current.id);
    }

    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  return (
    <nav aria-label="On this page" className={className}>
      <p className="section-label opacity-60">On this page</p>
      <ol className="mt-4 space-y-1">
        {sections.map((section, index) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                aria-current={isActive ? "true" : undefined}
                className={`legal-toc-link${isActive ? " legal-toc-link-active" : ""}`}
                href={`#${section.id}`}
              >
                <span className="legal-toc-number">{index + 1}</span>
                <span>{section.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
