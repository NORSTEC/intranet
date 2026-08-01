"use client";

import { motion } from "motion/react";

const COLORS = ["#1697B7", "#30C3CD", "#F3AD78", "#E8804C"] as const;
const LETTER_DELAY = 0.04;

function StripeArc({
  radius,
  color,
  delay,
}: {
  radius: number;
  color: string;
  delay: number;
}) {
  const size = 1000;
  const path = `M ${size - radius} 0 A ${radius} ${radius} 0 0 0 ${size} ${radius}`;

  return (
    <motion.path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={72}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ delay, duration: 0.55, ease: "easeOut" }}
    />
  );
}

function CurvedStripeSet({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg viewBox="0 0 1000 1000" className="size-full" aria-hidden="true">
      <g transform={mirrored ? "translate(1000 1000) rotate(180)" : undefined}>
        {COLORS.map((color, index) => (
          <StripeArc
            key={color}
            radius={650 - index * 112}
            color={color}
            delay={0.1 + index * 0.1}
          />
        ))}
      </g>
    </svg>
  );
}

export function LoginStripes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-24 -top-24 size-[30rem] xl:size-[35rem]">
        <CurvedStripeSet />
      </div>
      <div className="absolute -bottom-24 -left-24 size-[30rem] xl:size-[35rem]">
        <CurvedStripeSet mirrored />
      </div>
    </div>
  );
}

export function AnimatedTagline() {
  const text = "Securing our future in space.";

  return (
    <p className="text-2xl font-light italic leading-tight text-[#EDE8DA] xl:text-3xl">
      {text.split("").map((character, index) => (
        <motion.span
          key={`${character}-${index}`}
          className="inline-block"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 + index * LETTER_DELAY, duration: 0.22, ease: "easeOut" }}
        >
          {character === " " ? "\u00A0" : character}
        </motion.span>
      ))}
    </p>
  );
}

export function EggNorstecLogo() {
  return (
    <div
      className="size-28 xl:size-32"
      aria-hidden="true"
      style={{
        backgroundColor: "#EDE8DA",
        WebkitMaskImage: "url(/images/logo.png)",
        maskImage: "url(/images/logo.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
