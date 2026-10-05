import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@portfolio/ui/sonner";
import { ThemeProvider } from "@portfolio/ui/theme-provider";
import { TooltipProvider } from "@portfolio/ui/tooltip";
import "./globals.css";

// Fonts are committed to the repo (packages/ui/fonts, OFL) so builds never depend on fetching from Google.
const sans = localFont({ src: "../../../../packages/ui/fonts/inter-latin-wght-normal.woff2", weight: "100 900", variable: "--font-sans", display: "swap" });
const heading = localFont({ src: "../../../../packages/ui/fonts/fraunces-latin-wght-normal.woff2", weight: "100 900", variable: "--font-heading", display: "swap" });
const mono = localFont({
  src: "../../../../packages/ui/fonts/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3003"),
  title: { default: "Fernwood Supply — practical goods for home and trail", template: "%s · Fernwood Supply" },
  description: "Well-made kitchen, home, bath, garden and outdoor goods. A portfolio demo store with semantic search and Stripe checkout (test mode).",
  applicationName: "Fernwood Supply",
  openGraph: { type: "website", siteName: "Fernwood Supply", title: "Fernwood Supply", description: "Practical goods for home and trail." },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#141a16" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${heading.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
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
