"use client";

import { motion } from "motion/react";

type HamburgerSpinProps = {
  open: boolean;
  className?: string;
  lineClassName?: string;
  lineClassNameActive?: string;
  lineWidth?: number;
  thickness?: number;
  gap?: number;
};

export function HamburgerSpin({
  open,
  className,
  lineClassName,
  lineClassNameActive,
  lineWidth = 28,
  thickness = 2,
  gap = 7,
}: HamburgerSpinProps) {
  const height = thickness * 3 + gap * 2;
  const yTop = 0;
  const yMid = thickness + gap;
  const yBottom = (thickness + gap) * 2;
  const commonLine = ["absolute left-0", lineClassName ?? ""].join(" ");
  const activeLine = [
    "absolute left-0",
    lineClassNameActive ?? lineClassName ?? "",
  ].join(" ");

  return (
    <span
      className={["relative inline-block", className ?? ""].join(" ")}
      style={{ width: lineWidth, height }}
      aria-hidden="true"
    >
      <motion.span
        className="absolute inset-0"
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      >
        <motion.span
          className={open ? activeLine : commonLine}
          style={{ width: lineWidth, height: thickness, top: yTop }}
          animate={{ top: open ? yMid : yTop, rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
        />
        <motion.span
          className={open ? activeLine : commonLine}
          style={{ width: lineWidth, height: thickness, top: yMid }}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ duration: 0.12 }}
        />
        <motion.span
          className={open ? activeLine : commonLine}
          style={{ width: lineWidth, height: thickness, top: yBottom }}
          animate={{ top: open ? yMid : yBottom, rotate: open ? -45 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
        />
      </motion.span>
    </span>
  );
}
