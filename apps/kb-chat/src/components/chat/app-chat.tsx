"use client";
import { ChatPanel, type UiMessage } from "./chat-panel";

/** In-app chat: keeps the URL in sync with the conversation without remounting the panel. */
export function AppChat(props: { slug: string; conversationId?: string; messages: UiMessage[]; aiAvailable: boolean; suggestions: string[] }) {
  return (
    <ChatPanel
      key={props.conversationId ?? "new"}
      endpoint={`/api/w/${props.slug}/chat`}
      chunkEndpoint={`/api/w/${props.slug}/chunks`}
      initialConversationId={props.conversationId}
      initialMessages={props.messages}
      aiAvailable={props.aiAvailable}
      suggestions={props.suggestions}
      onConversation={(id) => window.history.replaceState(null, "", `/w/${props.slug}/chat/${id}`)}
    />
  );
}
