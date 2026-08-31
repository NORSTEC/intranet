"use client";

import { motion, useReducedMotion } from "motion/react";
import { MemberAvatar } from "@/components/portal/member-avatar";

const LETTER_DELAY = 0.035;

export function DashboardHero({
  avatarUrl,
  greetingName,
  name,
  subtitle,
}: {
  avatarUrl: string | undefined;
  greetingName: string;
  name: string;
  subtitle: string;
}) {
  const reduceMotion = useReducedMotion();
  const heading = `Hi, ${greetingName}`;
  const starDelay = 0.15 + heading.length * LETTER_DELAY;

  return (
    <section
      aria-label="Your intranet membership"
      className="dashboard-hero dashboard-rise portal-surface-strong px-6 py-9 sm:px-10 sm:py-12"
    >
      {/* A constellation rather than one mark: the geometry of each star lives
          in its own numbered class, so the arrangement is tuned in CSS and the
          markup only says how many there are. */}
      {[1, 2, 3, 4, 5, 6, 7].map((star) => (
        <span
          aria-hidden="true"
          className={`dashboard-hero-star dashboard-hero-star-${star}`}
          key={star}
        />
      ))}

      <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-12">
        <div className="min-w-0">
          <h1 aria-label={heading} className="flex items-center gap-3 text-h1 sm:gap-4">
            <span aria-hidden="true">
              {reduceMotion
                ? heading
                : heading.split("").map((character, index) => (
                    <motion.span
                      animate={{ opacity: 1, x: 0 }}
                      className="inline-block"
                      initial={{ opacity: 0, x: -10 }}
                      key={`${character}-${index}`}
                      transition={{
                        delay: index * LETTER_DELAY,
                        duration: 0.24,
                        ease: "easeOut",
                      }}
                    >
                      {character === " " ? " " : character}
                    </motion.span>
                  ))}
            </span>
            <motion.span
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              aria-hidden="true"
              className="dashboard-hero-heading-star inline-block shrink-0"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, scale: 0.4, rotate: -25 }
              }
              transition={{ delay: starDelay, duration: 0.4, ease: "backOut" }}
            />
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-egg/70">{subtitle}</p>
        </div>

        <div className="shrink-0">
          <MemberAvatar name={name} size="hero" src={avatarUrl} />
        </div>
      </div>
    </section>
  );
}
