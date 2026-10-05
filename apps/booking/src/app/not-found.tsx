import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-full w-full max-w-lg items-center px-4 py-16">
      <EmptyState
        className="w-full"
        icon={SearchX}
        title="Page not found"
        description="This page doesn't exist, or you don't have access to it."
        action={
          <Link href="/" className={buttonVariants()}>
            Back to booking
          </Link>
        }
      />
    </main>
  );
}
