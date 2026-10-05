import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Lora } from "next/font/google";
import { Toaster } from "@portfolio/ui/sonner";
import { ThemeProvider } from "@portfolio/ui/theme-provider";
import { TooltipProvider } from "@portfolio/ui/tooltip";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const heading = Lora({ variable: "--font-heading", subsets: ["latin"], display: "swap", weight: ["500", "600"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3004"),
  title: { default: "Lumen Wellness Studio — book online", template: "%s · Lumen Wellness Studio" },
  description: "Book massage, facials and acupuncture online with live availability. A Bookwell portfolio demo with a fictional studio.",
  applicationName: "Bookwell",
  openGraph: { type: "website", siteName: "Bookwell", title: "Lumen Wellness Studio — book online", description: "Live availability, instant confirmation." },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#12181c" },
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
