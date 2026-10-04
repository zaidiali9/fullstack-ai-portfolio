import { FileUp, MessageSquarePlus, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { TimeAgo } from "@/components/time-ago";
import { aiStatus } from "@/lib/ai";
import { cn } from "@/lib/utils";
import type { WsContext } from "@/server/authz";
import { getConversation, listConversations } from "@/server/chat";
import { listDocuments } from "@/server/documents";
import { can } from "@/server/permissions";
import { AppChat } from "./app-chat";
import type { UiMessage } from "./chat-panel";

const SUGGESTIONS = ["How many vacation days do I get?", "What is the expense limit for client dinners?", "How do I report a security incident?"];

/** Conversation history (left, desktop) + chat panel. Shared by /chat and /chat/[id]. */
export async function ChatScreen({ ctx, conversationId }: { ctx: WsContext; conversationId?: string }) {
  const slug = ctx.ws.slug;
  const [history, docs, current] = await Promise.all([
    listConversations(ctx.ws.id, ctx.user.id),
    listDocuments(ctx.ws.id),
    conversationId ? getConversation({ ws: ctx.ws, userId: ctx.user.id, source: "app" }, conversationId).catch(() => notFound()) : Promise.resolve(null),
  ]);
  const ready = docs.filter((d) => d.status === "ready").length;
  const messages: UiMessage[] = (current?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    sources: m.citations.map((c) => ({ ...c })),
  }));

  return (
    <div className="flex min-h-[calc(100svh-7rem)] flex-1 gap-6 lg:min-h-[calc(100svh-4rem)]">
      <aside className="hidden w-60 shrink-0 flex-col lg:flex" aria-label="Conversation history">
        <Link href={`/w/${slug}/chat`} className={cn(buttonVariants({ variant: "outline" }), "h-9 justify-start")}>
          <MessageSquarePlus className="size-4" aria-hidden /> New conversation
        </Link>
        <h2 className="mt-5 mb-2 px-1 text-xs font-medium text-muted-foreground uppercase">History</h2>
        {history.length ? (
          <ul className="space-y-0.5 overflow-y-auto">
            {history.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/w/${slug}/chat/${c.id}`}
                  aria-current={c.id === conversationId ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    c.id === conversationId && "bg-secondary font-medium",
                  )}
                >
                  <span className="line-clamp-1">{c.title}</span>
                  <span className="text-xs text-muted-foreground">
                    <TimeAgo date={c.updatedAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">No conversations yet.</p>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Chat">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{current?.conversation.title ?? "Ask your documents"}</h1>
            <p className="text-sm text-muted-foreground">
              Searching {ready} indexed document{ready === 1 ? "" : "s"} in {ctx.ws.name}
            </p>
          </div>
          <Link href={`/w/${slug}/chat`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "lg:hidden")}>
            <MessagesSquare className="size-4" aria-hidden /> New
          </Link>
        </div>
        {ready === 0 && !current ? (
          <EmptyState
            icon={FileUp}
            title="No documents yet"
            description="Upload PDFs, Word files, Markdown or add a web page. Once they're indexed you can ask questions about them."
            action={
              can(ctx.role, "docs:write") ? (
                <Link href={`/w/${slug}/documents`} className={buttonVariants()}>
                  Add documents
                </Link>
              ) : null
            }
          />
        ) : (
          <AppChat slug={slug} conversationId={conversationId} messages={messages} aiAvailable={!!aiStatus().chat} suggestions={SUGGESTIONS} />
        )}
      </section>
    </div>
  );
}
