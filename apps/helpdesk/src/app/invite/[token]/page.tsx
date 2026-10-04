import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { Brand } from "@/components/brand";
import { ActionButton } from "@/components/confirm-action-button";
import { acceptInviteAction } from "@/server/actions/orgs";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const session = await getSession();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <main id="main" className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16">
      <Brand />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">You&apos;ve been invited</h1>
      <p className="mt-2 text-muted-foreground">
        Accept to join the organization on Tidal Desk. The invitation must match the email you sign in with.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {session ? (
          <ActionButton action={acceptInviteAction.bind(null, token)} className="h-9 px-4">
            Accept as {session.user.email}
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
