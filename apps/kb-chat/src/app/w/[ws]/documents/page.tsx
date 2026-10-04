import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { DocumentList } from "@/components/documents/document-list";
import { Uploader } from "@/components/documents/uploader";
import { aiStatus } from "@/lib/ai";
import { env } from "@/lib/env";
import { requireWsPage } from "@/server/authz";
import { listDocuments } from "@/server/documents";
import { can } from "@/server/permissions";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ params }: PageProps<"/w/[ws]/documents">) {
  const { ws } = await params;
  const ctx = await requireWsPage(ws, "docs:read");
  const docs = await listDocuments(ctx.ws.id);
  const canWrite = can(ctx.role, "docs:write");
  return (
    <>
      <PageHeader
        title="Documents"
        description={`${docs.length} of ${ctx.ws.maxDocuments} documents. Answers only ever use documents in this workspace.`}
        actions={aiStatus().embeddings ? null : <AiUnavailable reason="Embeddings unavailable: keyword search only" />}
      />
      {canWrite ? (
        <div className="mb-6">
          <Uploader slug={ws} maxMb={env().MAX_UPLOAD_MB} />
        </div>
      ) : null}
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description={canWrite ? "Upload a file or add a web page to get started." : "An editor hasn't added any documents yet."} />
      ) : (
        <DocumentList slug={ws} initial={docs} canWrite={canWrite} />
      )}
    </>
  );
}
