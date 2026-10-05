import { ArrowRight, CalendarCheck, Clock, Radio, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { AssistantBox } from "@/components/booking/assistant-box";
import { aiStatus } from "@/lib/ai";
import { durationLabel, money } from "@/lib/format";
import { getBusiness, listServices, listStaff } from "@/server/catalog";

// Canonical is set per page (a layout-level canonical would make every page claim to be "/").
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [b, services, staff] = await Promise.all([getBusiness(), listServices(), listStaff()]);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  return (
    <>
      <section className="border-b bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.1fr_1fr] md:items-center md:py-16">
          <div>
            <p className="text-sm font-medium text-brand-clay">{b.name}</p>
            <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Book your next reset in under a minute.</h1>
            <p className="mt-4 max-w-prose text-lg text-muted-foreground">
              Massage, facials and acupuncture with live availability. Pick a time and it&apos;s held for you while you confirm — no double bookings, no phone tag.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="#services" className={buttonVariants({ size: "lg" })}>
                See services <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/my" className={buttonVariants({ size: "lg", variant: "outline" })}>
                My bookings
              </Link>
            </div>
          </div>
          <AssistantBox aiAvailable={!!aiStatus()} services={services.map((s) => ({ slug: s.slug, name: s.name }))} timezone={b.timezone} />
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12" aria-labelledby="services-heading">
        <h2 id="services-heading" className="font-heading text-2xl font-semibold tracking-tight">
          Services
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <li key={s.id} className="flex flex-col rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{s.name}</h3>
                <span className="font-semibold tabular-nums">{money(s.priceCents)}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden /> {durationLabel(s.durationMin)}
              </p>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.description}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex -space-x-1.5">
                  <span className="sr-only">With {s.staffIds.map((id) => staffById.get(id)?.name).join(", ")}</span>
                  {s.staffIds.map((id) => {
                    const p = staffById.get(id);
                    return p ? (
                      <span key={id} title={p.name} className="flex size-7 items-center justify-center rounded-full border-2 border-card text-[11px] font-semibold text-white" style={{ backgroundColor: p.color }} aria-hidden>
                        {p.name[0]}
                      </span>
                    ) : null;
                  })}
                </div>
                <Link href={`/book/${s.slug}`} className={buttonVariants({ size: "sm" })} aria-label={`Book ${s.name}`}>
                  Book
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="team" className="border-t bg-muted/30" aria-labelledby="team-heading">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
          <h2 id="team-heading" className="font-heading text-2xl font-semibold tracking-tight">
            Team
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {staff.map((p) => (
              <li key={p.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full font-semibold text-white" style={{ backgroundColor: p.color }} aria-hidden>
                    {p.name[0]}
                  </span>
                  <div>
                    <h3 className="font-medium">{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.title}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{p.bio}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-label="How booking works">
        <ul className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Radio, title: "Live availability", body: "Times update the moment someone else books — you won't pick a slot that's already gone." },
            { icon: CalendarCheck, title: "Held while you confirm", body: "Choosing a time reserves it for a few minutes so you can add notes without racing anyone." },
            { icon: ShieldCheck, title: `Change up to ${b.minNoticeMin} minutes before`, body: "Reschedule or cancel online from My bookings. After that, call the studio." },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon className="size-5 text-primary" aria-hidden />
              <h3 className="mt-2 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
