import type { Metadata } from "next";
import { PageHeader } from "@portfolio/ui/page-header";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { aiStatus } from "@/lib/ai";

export const metadata: Metadata = { title: "Ask", robots: { index: false } };

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 500) : undefined;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Ask" description="Questions become read-only SQL over the demo dataset. Every query is shown, checked and logged." />
      <AskWorkspace aiAvailable={!!aiStatus()} initialQuestion={q} />
    </div>
  );
}
