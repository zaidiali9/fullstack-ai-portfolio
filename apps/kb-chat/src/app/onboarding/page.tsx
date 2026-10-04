import type { Metadata } from "next";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding-form";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-col px-4 py-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Brand href="/app" />
        <ThemeToggle />
      </div>
      <main id="main" className="mx-auto w-full max-w-md flex-1 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A workspace holds a set of documents and the people who can ask questions about them. You&apos;ll be its owner.
        </p>
        <div className="mt-8 rounded-xl border bg-card p-6">
          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}
