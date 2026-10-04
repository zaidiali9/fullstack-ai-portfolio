"use client";
import { ChatPanel } from "./chat-panel";

export function EmbedChat({ widgetKey, greeting, aiAvailable }: { widgetKey: string; greeting: string; aiAvailable: boolean }) {
  return (
    <ChatPanel
      compact
      endpoint={`/api/embed/${widgetKey}/chat`}
      initialMessages={[]}
      aiAvailable={aiAvailable}
      greeting={greeting}
    />
  );
}
