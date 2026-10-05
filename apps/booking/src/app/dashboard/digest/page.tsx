import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@portfolio/ui/page-header";
import { DigestPanel } from "@/components/dashboard/digest-panel";
import { aiStatus } from "@/lib/ai";
import { dayLabel } from "@/lib/format";
import { requireTeamPage } from "@/server/access";
import { digestStats } from "@/server/ai/features";

export const metadata: Metadata = { title: "Weekly digest" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function DigestPage() {
  const user = await requireTeamPage();
  if (user.role !== "owner") notFound();
  const s = await digestStats();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly digest"
        description={`Last 7 days (${dayLabel(s.period.from, { month: "short", day: "numeric" })} onward) and the week ahead. Figures are computed from bookings; demo data is seed data.`}
      />
      <section aria-labelledby="past-heading">
        <h2 id="past-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          Last 7 days
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Appointments" value={s.past7.appointments} hint={`${s.past7.completed} completed`} />
          <Stat label="No-shows" value={s.past7.noShows} />
          <Stat label="Cancellations" value={s.past7.cancellations} />
          <Stat label="Booked value" value={`$${s.past7.bookedValueUsd.toLocaleString("en-US")}`} hint="Excludes no-shows" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {s.past7.topService ? `Most booked: ${s.past7.topService.name} (${s.past7.topService.count}).` : "No bookings yet."}{" "}
          {s.past7.busiestDay ? `Busiest day: ${s.past7.busiestDay.day} (${s.past7.busiestDay.count}).` : ""}
        </p>
      </section>
      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          Next 7 days · {s.next7.appointments} booked
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Staff
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Appointments
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Booked share of working hours
                </th>
              </tr>
            </thead>
            <tbody>
              {s.next7.byStaff.map((p) => (
                <tr key={p.name} className="border-t">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    {p.name}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums">{p.appointments}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(p.utilizationPct, 100)}%` }} />
                      </div>
                      <span className="tabular-nums">{p.utilizationPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.next7.quietestDay ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Quietest open day: {s.next7.quietestDay.day} ({s.next7.quietestDay.appointments} booked).
          </p>
        ) : null}
      </section>
      <DigestPanel aiAvailable={!!aiStatus()} />
    </div>
  );
}
