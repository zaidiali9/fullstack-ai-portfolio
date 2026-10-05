import { ArrowRight, Database, Download, Eye, LayoutDashboard, ListChecks, Lock, ShieldCheck, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { AppHeader } from "@/components/app/header";
import { currentUser } from "@/server/access";
import { exampleShareToken } from "@/server/queries";
import { TABLES } from "@/server/sql/dataset";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const SAMPLES = ["Monthly revenue from completed orders", "Top 10 products by units sold", "Revenue by region in the last 90 days", "Average support satisfaction by ticket category"];

const LAYERS = [
  { icon: ListChecks, title: "Parsed, then allowlisted", body: "The real PostgreSQL parser reads every query. Only one SELECT over the dataset's tables, with approved functions and types, gets through." },
  { icon: Lock, title: "Read-only, least privilege", body: "Queries run in a READ ONLY transaction as a database role that can only read the demo tables — not users, sessions or passwords." },
  { icon: Timer, title: "Bounded", body: "A planner cost ceiling, a statement timeout and a row cap stop runaway joins before they start." },
  { icon: Eye, title: "Visible and editable", body: "The generated SQL is always shown. Edit it and re-run through the same checks; every attempt is logged." },
];

export default async function LandingPage() {
  const [user, token] = await Promise.all([currentUser(), exampleShareToken()]);
  return (
    <>
      <AppHeader user={user ? { name: user.name, role: user.role } : null} />
      <main id="main" className="flex-1">
        <section className="border-b bg-gradient-to-b from-secondary/60 to-background">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <p className="text-sm font-medium text-brand-clay">Natural-language analytics</p>
            <h1 className="mt-2 max-w-3xl font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">Ask your data in plain English. Get a chart, the SQL behind it, and nothing else.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Tally turns questions into read-only SQL, checks it with a real PostgreSQL parser before it runs, and lets you save the answers, build dashboards and share them.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={user ? "/ask" : "/sign-in?demo=analyst&next=%2Fask"} className={buttonVariants({ size: "lg" })}>
                {user ? "Open Tally" : "Try the demo"} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {token ? (
                <Link href={`/shared/${token}`} className={buttonVariants({ size: "lg", variant: "outline" })}>
                  <LayoutDashboard className="size-4" aria-hidden /> See a shared dashboard
                </Link>
              ) : null}
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Example questions">
              {SAMPLES.map((q) => (
                <li key={q}>
                  <Link href={user ? `/ask?q=${encodeURIComponent(q)}` : `/sign-in?demo=analyst&next=${encodeURIComponent(`/ask?q=${q}`)}`} className="inline-block rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                    “{q}”
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="safety-heading">
          <h2 id="safety-heading" className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <ShieldCheck className="size-6 text-brand-clay" aria-hidden /> AI writes the SQL. It never gets the keys.
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LAYERS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl border bg-card p-5">
                <Icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-3 font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="dataset" className="border-t bg-muted/30" aria-labelledby="dataset-heading">
          <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
            <h2 id="dataset-heading" className="flex items-center gap-2 font-heading text-2xl font-semibold">
              <Database className="size-6 text-primary" aria-hidden /> The demo dataset
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Lanternfish Supply Co. is a fictional online retailer. Two years of orders, customers, products, marketing spend and support tickets — all generated seed data, with no personal details.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TABLES.map((t) => (
                <li key={t.name} className="rounded-xl border bg-card p-4">
                  <p className="font-mono text-sm font-medium">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{t.columns.map((c) => c.name).join(", ")}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Download className="size-4" aria-hidden /> Every result exports to CSV (with spreadsheet formula injection neutralised).
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">Tally is a portfolio demo. Data is fictional seed data; AI answers come from a real model call and are always shown with their SQL.</p>
      </footer>
    </>
  );
}
