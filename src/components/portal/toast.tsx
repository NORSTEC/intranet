"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const toastStyles = {
  success: { className: "bg-sky", icon: "check_circle" },
  warning: { className: "bg-sun", icon: "warning" },
  error: { className: "bg-copper", icon: "error" },
} as const;

export function Toast({
  clearParams = [],
  message,
  status,
}: {
  clearParams?: string[];
  message: string;
  status: keyof typeof toastStyles;
}) {
  const [exiting, setExiting] = useState(false);
  const [mounted, setMounted] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const style = toastStyles[status];

  useEffect(() => {
    const timeout = window.setTimeout(() => setExiting(true), 6000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (mounted || clearParams.length === 0) return;
    const params = new URLSearchParams(searchParams.toString());
    clearParams.forEach((parameter) => params.delete(parameter));
    router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, { scroll: false });
  }, [clearParams, mounted, pathname, router, searchParams]);

  if (!mounted) return null;

  return (
    <div
      aria-live={status === "error" ? "assertive" : "polite"}
      className={`portal-toast ${style.className}${exiting ? " portal-toast-exit" : ""}`}
      onAnimationEnd={() => {
        if (exiting) setMounted(false);
      }}
      role={status === "error" ? "alert" : "status"}
    >
      <span className="material-symbols-outlined shrink-0 text-[1.35rem]" aria-hidden="true">
        {style.icon}
      </span>
      <p className="min-w-0 flex-1 font-medium leading-snug">{message}</p>
    </div>
  );
}
