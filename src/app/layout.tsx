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
    default: "Norstec Portal",
    template: "%s | Norstec Portal",
  },
  description: "The internal portal for Norstec member organizations.",
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
