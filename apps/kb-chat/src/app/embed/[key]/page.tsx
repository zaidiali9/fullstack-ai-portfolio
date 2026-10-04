import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EmbedChat } from "@/components/chat/embed-chat";
import { aiStatus } from "@/lib/ai";
import { env } from "@/lib/env";
import { embedAllowed, getWidgetWorkspace } from "@/server/workspaces";

export const metadata: Metadata = { title: "Help chat", robots: { index: false, follow: false } };

/** The widget iframe. Only renders when embedded on an allowlisted site (or previewed from the app). */
export default async function EmbedPage({ params }: PageProps<"/embed/[key]">) {
  const { key } = await params;
  const ws = await getWidgetWorkspace(key);
  if (!ws) notFound();
  const h = await headers();
  if (!embedAllowed(ws.widgetAllowedOrigins, h.get("referer"), new URL(env().APP_URL).origin)) {
    return (
      <main id="main" className="flex min-h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        This chat widget isn&apos;t enabled for this website.
      </main>
    );
  }
  return (
    <main id="main" className="flex h-svh flex-col bg-background">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{ws.name}</p>
        <p className="text-xs text-muted-foreground">Answers come from {ws.name}&apos;s documents · AI-generated, may be imperfect</p>
      </header>
      <EmbedChat widgetKey={key} greeting={ws.widgetGreeting} aiAvailable={!!aiStatus().chat} />
    </main>
  );
}
