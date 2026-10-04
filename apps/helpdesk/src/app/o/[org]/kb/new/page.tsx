import type { Metadata } from "next";
import { PageHeader } from "@portfolio/ui/page-header";
import { ArticleForm } from "@/components/kb/article-form";
import { requireOrgPage } from "@/server/authz";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticlePage({ params }: PageProps<"/o/[org]/kb/new">) {
  const { org } = await params;
  await requireOrgPage(org, "kb:write");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New article" description="Write it once; customers can read it and AI drafts can cite it." />
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <ArticleForm orgSlug={org} />
      </div>
    </div>
  );
}
