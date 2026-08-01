"use client";

import React from "react";

type ThemeSetting = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeSetting) => void;
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function resolveTheme(theme: ThemeSetting) {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<ThemeSetting>("system");
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("light");
  const transitionFrame = React.useRef<number | null>(null);

  const applyResolvedTheme = React.useCallback((next: "light" | "dark") => {
    const root = document.documentElement;

    if (transitionFrame.current !== null) {
      window.cancelAnimationFrame(transitionFrame.current);
    }

    root.classList.add("theme-switching");
    setResolvedTheme(next);
    root.dataset.theme = next;

    transitionFrame.current = window.requestAnimationFrame(() => {
      transitionFrame.current = window.requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
        transitionFrame.current = null;
      });
    });
  }, []);

  React.useEffect(() => {
    const stored = localStorage.getItem("theme-preference");
    if (stored === "light" || stored === "dark") {
      // Sync the client state to the value applied by the pre-hydration script.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(stored);
      return;
    }
    setTheme("system");
  }, []);

  React.useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = query.matches ? "dark" : "light";
      applyResolvedTheme(next);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [applyResolvedTheme, theme]);

  React.useEffect(() => {
    const next = resolveTheme(theme);
    // Keep React state and the pre-hydration document theme synchronized.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyResolvedTheme(next);
    if (theme === "system") localStorage.removeItem("theme-preference");
    else localStorage.setItem("theme-preference", theme);
  }, [applyResolvedTheme, theme]);

  React.useEffect(() => {
    return () => {
      if (transitionFrame.current !== null) {
        window.cancelAnimationFrame(transitionFrame.current);
      }
      document.documentElement.classList.remove("theme-switching");
    };
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((current) => (resolveTheme(current) === "dark" ? "light" : "dark"));
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
