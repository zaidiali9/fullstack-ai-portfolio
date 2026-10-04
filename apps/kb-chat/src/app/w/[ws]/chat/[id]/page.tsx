import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChatScreen } from "@/components/chat/chat-screen";
import { requireWsPage } from "@/server/authz";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: PageProps<"/w/[ws]/chat/[id]">) {
  const { ws, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <ChatScreen ctx={await requireWsPage(ws, "chat:ask")} conversationId={id} />;
}
