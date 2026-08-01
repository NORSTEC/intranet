"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";

export function PortalLogoToggle({ open }: { open: boolean }) {
  const { resolvedTheme } = useTheme();
  const [forceColor, setForceColor] = useState(resolvedTheme === "dark" || open);

  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const timeout = window.setTimeout(
      () => setForceColor(resolvedTheme === "dark" || open),
      isDesktop && !open ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [open, resolvedTheme]);

  return (
    <div className="relative h-10 w-10">
      <motion.div
        initial={false}
        animate={{ opacity: forceColor ? 0 : 1 }}
        transition={{ duration: 0.2, ease: [0.25, 0.8, 0.5, 1] }}
      >
        <Image
          src="/images/logo.png"
          alt="Norstec"
          fill
          priority
          className="object-contain portal-logo-monochrome"
        />
      </motion.div>
      <motion.div
        initial={false}
        animate={{ opacity: forceColor ? 1 : 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.8, 0.5, 1] }}
      >
        <Image
          src="/images/logo.png"
          alt=""
          fill
          priority
          className="object-contain"
        />
      </motion.div>
    </div>
  );
}
