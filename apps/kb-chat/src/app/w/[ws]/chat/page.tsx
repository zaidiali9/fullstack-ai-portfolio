import type { Metadata } from "next";
import { ChatScreen } from "@/components/chat/chat-screen";
import { requireWsPage } from "@/server/authz";

export const metadata: Metadata = { title: "Ask" };

export default async function ChatPage({ params }: PageProps<"/w/[ws]/chat">) {
  const { ws } = await params;
  return <ChatScreen ctx={await requireWsPage(ws, "chat:ask")} />;
}
