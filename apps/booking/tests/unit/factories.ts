import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { AppUser, Role } from "@/server/access";
import { addDays, dateInTz, weekdayOf } from "@/server/scheduling/time";
import { BUSINESS, seedCatalog, STAFF } from "@db/seed-data";

export async function makeUser(role: Role = "customer", name = `${role} user`): Promise<AppUser> {
  const id = randomUUID();
  const [u] = await db
    .insert(schema.user)
    .values({ id, name, email: `${id.slice(0, 8)}@test.demo`, emailVerified: true, role })
    .returning();
  return { id: u!.id, name: u!.name, email: u!.email, role };
}

/** The seed catalog plus an owner, Sam's staff login and two customers. */
export async function studio() {
  const owner = await makeUser("owner", "Olive Owner");
  const samUser = await makeUser("staff", "Sam Rivera");
  const catalog = await seedCatalog(db, { staffUserIds: { sam: samUser.id } });
  const svc = (slug: string) => {
    const s = catalog.services.find((x) => x.slug === slug)!;
    const staffIds = STAFF.filter((p) => (p.services as readonly string[]).includes(slug)).map((p) => catalog.staff[p.key].id);
    return { ...s, staffIds };
  };
  return {
    ...catalog,
    owner,
    samUser,
    customer: await makeUser("customer", "Casey Customer"),
    other: await makeUser("customer", "Olive Other"),
    svc,
  };
}

/** The next date (at least `minDays` ahead) on which a weekday predicate holds. */
export function nextDate(pred: (weekday: number) => boolean, minDays = 2): string {
  let d = addDays(dateInTz(new Date(), BUSINESS.timezone), minDays);
  while (!pred(weekdayOf(d))) d = addDays(d, 1);
  return d;
}
