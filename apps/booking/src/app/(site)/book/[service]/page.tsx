import { ChevronLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlotPicker } from "@/components/booking/slot-picker";
import { durationLabel, money } from "@/lib/format";
import { currentUser } from "@/server/access";
import { getBusiness, listServices, listStaff } from "@/server/catalog";

async function load(slug: string) {
  const services = await listServices();
  return services.find((s) => s.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/book/[service]">): Promise<Metadata> {
  const s = await load((await params).service);
  return { title: s ? `Book ${s.name}` : "Book" };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BookPage({ params, searchParams }: PageProps<"/book/[service]">) {
  const [{ service: slug }, sp] = await Promise.all([params, searchParams]);
  const service = await load(slug);
  if (!service) notFound();
  const [b, staff, user] = await Promise.all([getBusiness(), listStaff(), currentUser()]);
  const offering = staff.filter((p) => service.staffIds.includes(p.id));
  const date = one(sp.date);
  const time = one(sp.time);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/#services" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> All services
      </Link>
      <div className="mt-3 mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{service.name}</h1>
          <p className="mt-1 max-w-prose text-muted-foreground">{service.description}</p>
        </div>
        <p className="flex shrink-0 items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-4" aria-hidden /> {durationLabel(service.durationMin)}
          </span>
          <span className="text-lg font-semibold tabular-nums">{money(service.priceCents)}</span>
        </p>
      </div>
      <SlotPicker
        service={{ id: service.id, slug: service.slug, name: service.name }}
        staff={offering.map((p) => ({ id: p.id, name: p.name, title: p.title, color: p.color }))}
        timezone={b.timezone}
        initial={{ staffId: one(sp.staff), date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined, time: time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString() : undefined }}
        signedIn={!!user}
        mode={{ kind: "book" }}
      />
      {!user ? (
        <p className="mt-6 text-sm text-muted-foreground">
          You&apos;ll be asked to sign in (or create an account) when you pick a time.{" "}
          <Link href={`/sign-in?demo=customer&next=${encodeURIComponent(`/book/${service.slug}`)}`} className="underline underline-offset-4">
            Use the demo customer
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
