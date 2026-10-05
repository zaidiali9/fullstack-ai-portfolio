import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "@portfolio/ui/sonner";
import { ThemeProvider } from "@portfolio/ui/theme-provider";
import { TooltipProvider } from "@portfolio/ui/tooltip";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const heading = Space_Grotesk({ variable: "--font-heading", subsets: ["latin"], display: "swap", weight: ["500", "600", "700"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3005"),
  title: { default: "Tally — ask your data in plain English", template: "%s · Tally" },
  description: "Natural-language analytics: questions become safe, read-only SQL with charts, saved queries, shareable dashboards and CSV export. A portfolio demo on fictional data.",
  applicationName: "Tally",
  openGraph: { type: "website", siteName: "Tally", title: "Tally — ask your data in plain English", description: "Questions in, charts out. Every query visible and read-only." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaff" },
    { media: "(prefers-color-scheme: dark)", color: "#13141f" },
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
