import { ArrowRight, BookMarked, Code2, FileSearch, Gauge, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";

const steps = [
  { title: "Upload", body: "PDF, Word, Markdown, text or a public web page. Files are checked by their contents, not just the extension." },
  { title: "Index in the background", body: "Text is extracted, split into passages and embedded into Postgres + pgvector. Progress shows live." },
  { title: "Ask", body: "Hybrid search (meaning + keywords) finds the best passages; the model answers only from them." },
  { title: "Verify", body: "Every claim carries a numbered citation that opens the exact passage and page." },
];

const features = [
  { icon: FileSearch, title: "Grounded or nothing", body: "If no passage is relevant, Cairn says it couldn't find the answer — without even calling the model." },
  { icon: BookMarked, title: "Page-level citations", body: "Citations map to stored passages with document title and page number, not model guesses." },
  { icon: Code2, title: "Embeddable widget", body: "One script tag adds a help chat to your site. Only allowlisted websites can load it." },
  { icon: Lock, title: "Private workspaces", body: "Documents and conversations are scoped to a workspace with owner, editor and viewer roles." },
  { icon: Gauge, title: "Usage limits", body: "Monthly question limits, document caps and per-user / per-visitor rate limits keep costs predictable." },
  { icon: ShieldCheck, title: "Defensive by default", body: "SSRF-safe URL fetching, robots.txt respected, untrusted text fenced from instructions, uploads deleted after indexing." },
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
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand-amber" aria-hidden /> Portfolio demo · runs on free open-source models
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Answers from your documents, with the page they came from.</h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            Cairn turns handbooks, policies and product docs into a chat your team or customers can trust: every answer is built
            only from your files and cites its sources.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-in?demo=viewer" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
              Try the demo workspace <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/sign-in?demo=owner" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
              Sign in as the owner
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">The demo workspace contains a fictional company handbook (seed data).</p>
        </section>

        <section aria-labelledby="how" className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="how" className="text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="rounded-xl border bg-card p-5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="features" className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="features" className="text-2xl font-semibold tracking-tight">
              Built for answers you can check
            </h2>
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
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Cairn — a portfolio project. Demo content is fictional seed data.</p>
          <p>Next.js · PostgreSQL + pgvector · Drizzle · Better Auth</p>
        </div>
      </footer>
    </div>
  );
}
