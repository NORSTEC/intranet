import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import { ThemeProvider } from "@/hooks/use-theme";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-barlow",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "NORSTEC Portal",
    template: "%s | NORSTEC Portal",
  },
  description: "The internal portal for NORSTEC member organizations.",
  icons: {
    icon: [{ url: "/favicon.ico?v=3", type: "image/x-icon" }],
    shortcut: "/favicon.ico?v=3",
  },
};

const themeInitScript = `
  (() => {
    try {
      const stored = localStorage.getItem("theme-preference");
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = stored === "dark" || (stored !== "light" && systemDark) ? "dark" : "light";
    } catch (_) {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={barlow.variable} suppressHydrationWarning>
      <head>
        {/* The icon font is vendored under public/fonts and declared in
            globals.css — next/font cannot host it, since Google's icon
            families are not in its catalogue. Icons stay invisible until it
            arrives, so it is fetched alongside the stylesheet rather than
            after it. Same-origin fonts are still requested anonymously, hence
            crossOrigin. */}
        <link
          as="font"
          crossOrigin="anonymous"
          href="/fonts/material-symbols-outlined.woff2"
          rel="preload"
          type="font/woff2"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
