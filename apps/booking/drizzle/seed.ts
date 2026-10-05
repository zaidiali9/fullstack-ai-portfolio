/**
 * Seed script: demo accounts and the fictional Lumen Wellness Studio (SEED DATA): services, staff,
 * weekly hours and ~40 bookings around today. Re-running resets the studio data.
 * Usage: npm run db:seed
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { inArray, like, or, sql } from "drizzle-orm";
import { db, dbHandle, schema } from "@/db";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { formatDateLong, formatTime, dateInTz } from "@/server/scheduling/time";
import { BUSINESS, seedBookings, seedCatalog } from "./seed-data";

const USERS = [
  { key: "owner", name: "Dana Okafor", email: DEMO_ACCOUNTS.owner.email, role: "owner" },
  { key: "sam", name: "Sam Rivera", email: DEMO_ACCOUNTS.staff.email, role: "staff" },
  { key: "jamie", name: "Jamie Lee", email: DEMO_ACCOUNTS.customer.email, role: "customer" },
  // Extra fictional customers so the calendar looks lived-in (SEED DATA).
  ...["Riley Brooks", "Avery Patel", "Jordan Kim", "Casey Morgan", "Quinn Alvarez", "Taylor Nguyen", "Morgan Silva"].map((name) => ({
    key: name,
    name,
    email: `${name.split(" ")[0]!.toLowerCase()}@customers.bookwell.demo`,
    role: "customer",
  })),
] as const;

async function main() {
  const t0 = Date.now();
  await db.delete(schema.user).where(or(inArray(schema.user.email, USERS.map((u) => u.email)), like(schema.user.email, "%@customers.bookwell.demo")));
  await db.execute(sql`truncate table notifications, activity, bookings, time_off, availability_rules, staff_services, staff, services, business restart identity cascade`);

  const hash = await hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const id = randomUUID();
    ids[u.key] = id;
    await db.insert(schema.user).values({ id, name: u.name, email: u.email, emailVerified: true, role: u.role });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }

  const { services, staff } = await seedCatalog(db, { staffUserIds: { sam: ids.sam } });
  const customerIds = USERS.filter((u) => u.role === "customer").map((u) => ids[u.key]!);
  const now = new Date();
  const bookings = await seedBookings(db, { now, customerIds, services, staff, perDay: 4, daysAhead: 10 });

  // Activity feed and owner notifications for the most recent seeded bookings (labelled as seed data).
  const recent = [...bookings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8);
  for (const bk of recent) {
    const svc = services.find((s) => s.id === bk.serviceId)!;
    const when = `${formatDateLong(dateInTz(bk.startsAt, BUSINESS.timezone))} at ${formatTime(bk.startsAt, BUSINESS.timezone)}`;
    const verb = bk.status === "cancelled" ? "cancelled" : "booked";
    await db.insert(schema.activity).values({
      actorId: bk.customerId,
      type: `booking.${bk.status === "cancelled" ? "cancelled" : "confirmed"}`,
      bookingId: bk.id,
      summary: `[seed data] ${svc.name} ${verb} for ${when} (${bk.reference})`,
      createdAt: bk.createdAt,
    });
  }
  await db.insert(schema.notifications).values(
    recent.slice(0, 3).map((bk) => ({
      userId: ids.owner!,
      title: "New booking",
      body: `[seed data] ${services.find((s) => s.id === bk.serviceId)!.name} ${bk.reference}`,
      bookingId: bk.id,
      createdAt: bk.createdAt,
    })),
  );

  const byStatus = bookings.reduce<Record<string, number>>((m, b) => ((m[b.status] = (m[b.status] ?? 0) + 1), m), {});
  console.log(`Seeded ${USERS.length} users, ${services.length} services, ${Object.keys(staff).length} staff, ${bookings.length} bookings ${JSON.stringify(byStatus)} in ${Date.now() - t0}ms`);
  console.log(`Demo logins (password "${DEMO_PASSWORD}"): ${Object.values(DEMO_ACCOUNTS).map((a) => a.email).join(", ")}`);
  await dbHandle().close();
}

main().catch(async (err) => {
  console.error(err);
  await dbHandle()
    .close()
    .catch(() => {});
  process.exit(1);
});
