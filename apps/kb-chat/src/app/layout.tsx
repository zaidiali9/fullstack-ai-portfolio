import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@portfolio/ui/sonner";
import { ThemeProvider } from "@portfolio/ui/theme-provider";
import { TooltipProvider } from "@portfolio/ui/tooltip";
import "./globals.css";

// Fonts are committed to the repo (packages/ui/fonts, OFL) so builds never depend on fetching from Google.
const sans = localFont({ src: "../../../../packages/ui/fonts/plus-jakarta-sans-latin-wght-normal.woff2", weight: "200 800", variable: "--font-sans", display: "swap" });
const mono = localFont({
  src: "../../../../packages/ui/fonts/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3002"),
  title: { default: "Cairn — chat with your documents", template: "%s · Cairn" },
  description:
    "Upload PDFs, Word files, Markdown or web pages and get answers with citations to the exact page. Portfolio demo app.",
  applicationName: "Cairn",
  openGraph: { type: "website", siteName: "Cairn", title: "Cairn — chat with your documents", description: "Answers grounded in your documents, with page-level citations." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#15151f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
