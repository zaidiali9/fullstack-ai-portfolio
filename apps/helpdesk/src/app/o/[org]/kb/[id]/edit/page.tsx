import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@portfolio/ui/page-header";
import { ArticleForm } from "@/components/kb/article-form";
import { requireOrgPage } from "@/server/authz";
import { getArticle } from "@/server/kb";

export const metadata: Metadata = { title: "Edit article" };

export default async function EditArticlePage({ params }: PageProps<"/o/[org]/kb/[id]/edit">) {
  const { org, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireOrgPage(org, "kb:write");
  const article = await getArticle(ctx, id).catch(() => notFound());
  return (
    <div className="max-w-3xl">
      <PageHeader title="Edit article" />
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <ArticleForm orgSlug={org} article={article} />
      </div>
    </div>
  );
}
