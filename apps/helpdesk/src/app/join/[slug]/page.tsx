import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@portfolio/ui/button";
import { Brand } from "@/components/brand";
import { ActionButton } from "@/components/confirm-action-button";
import { joinOrgAction } from "@/server/actions/orgs";
import { loadMembership } from "@/server/authz";
import { getPublicOrg } from "@/server/orgs";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Support portal" };

/** Public support-portal entry: customers join an organization to open tickets. */
export default async function JoinPage({ params }: PageProps<"/join/[slug]">) {
  const { slug } = await params;
  const org = await getPublicOrg(slug);
  if (!org || !org.allowCustomerSignup) notFound();
  const session = await getSession();
  if (session && (await loadMembership(session.user.id, slug))) redirect(`/o/${slug}/tickets`);
  const next = encodeURIComponent(`/join/${slug}`);
  return (
    <main id="main" className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
      <Brand />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{org.name} support</h1>
      <p className="mt-2 text-muted-foreground">Open and track support requests with the {org.name} team.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {session ? (
          <ActionButton action={joinOrgAction.bind(null, slug)} className="h-9 px-4">
            Continue as {session.user.name}
          </ActionButton>
        ) : (
          <>
            <Link href={`/sign-up?next=${next}`} className={buttonVariants({ className: "h-9 px-4" })}>
              Create an account
            </Link>
            <Link href={`/sign-in?next=${next}`} className={buttonVariants({ variant: "outline", className: "h-9 px-4" })}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
