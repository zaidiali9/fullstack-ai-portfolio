import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@portfolio/ui/sonner";
import { ThemeProvider } from "@portfolio/ui/theme-provider";
import { TooltipProvider } from "@portfolio/ui/tooltip";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"], display: "swap", weight: ["500", "600"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

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
