import { ArrowRight, BookOpenText, Inbox, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

const features = [
  { icon: Sparkles, title: "AI triage on arrival", body: "Every new ticket gets a category, priority, sentiment and one-line summary from the configured model, validated against a strict schema. Agents can override it." },
  { icon: BookOpenText, title: "Replies grounded in your KB", body: "Draft replies stream in using only your knowledge base articles, with [KB-n] citations you can check. Agents edit before anything is sent." },
  { icon: Workflow, title: "Thread summaries", body: "Taking over a long conversation? Get a bullet summary of the problem, what was tried and the next step." },
  { icon: Users, title: "Multi-tenant with roles", body: "Organizations, invitations, and admin / agent / customer roles. Customers only ever see their own tickets." },
  { icon: ShieldCheck, title: "Built-in guardrails", body: "Rate limits, per-plan daily AI quotas, prompt-injection fencing, audit log, and a clear “AI unavailable” state instead of fake output." },
  { icon: Inbox, title: "Plans and billing", body: "Free and Pro plans with Stripe Checkout and Customer Portal (test mode), kept in sync by signed webhooks." },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Brand />
          <nav className="flex items-center gap-1" aria-label="Main">
            <ThemeToggle />
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants()}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-72 bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_65%)]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-14 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand-coral" aria-hidden /> Portfolio demo · open-source models supported
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              The helpdesk that sorts the queue before your team opens it.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
              Tidal Desk is a multi-tenant support desk: customers open tickets, agents work them, and AI handles the
              busywork — triage, first drafts grounded in your knowledge base, and handover summaries.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-in?demo=agent" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
                Try the agent demo <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/sign-in?demo=customer" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
                Try as a customer
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Demo accounts are created by the seed script and contain only seed data.</p>
          </div>
        </section>

        <section aria-labelledby="features" className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="features" className="text-2xl font-semibold tracking-tight">What it does</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <li key={f.title} className="rounded-xl border bg-card p-5">
                  <f.icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="how" className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
            <div>
              <h2 id="how" className="text-2xl font-semibold tracking-tight">How the AI is wired</h2>
              <p className="mt-3 text-muted-foreground">
                One provider-agnostic layer talks to local open models (Transformers.js or Ollama), free hosted tiers
                (Groq, Gemini, Hugging Face) or a paid key — whichever the server is configured with. No paid key is
                required, and if no provider is configured every AI feature says so instead of pretending.
              </p>
            </div>
            <ol className="space-y-3 text-sm">
              {[
                "Ticket text is fenced as untrusted data, so instructions inside it are not followed.",
                "Model output is parsed and validated with zod; invalid output gets a repair attempt, then fails visibly.",
                "Calls have timeouts, retries with backoff, per-user rate limits and per-plan daily quotas.",
                "Every call is logged (feature, model, tokens, latency) and visible to admins under Usage.",
              ].map((s, i) => (
                <li key={s} className="flex gap-3 rounded-lg border bg-card p-4">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Tidal Desk — a portfolio project. All data shown is seed data.</p>
          <p>Next.js · PostgreSQL · Drizzle · Better Auth · Stripe (test mode)</p>
        </div>
      </footer>
    </div>
  );
}
