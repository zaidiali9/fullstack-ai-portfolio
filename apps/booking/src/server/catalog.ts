import "server-only";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { notFound as httpNotFound } from "@portfolio/kit";
import { db, schema } from "@/db";

export const getBusiness = cache(async () => {
  const [b] = await db.select().from(schema.business).limit(1);
  if (!b) throw new Error("Business settings missing — run `npm run db:seed`.");
  return b;
});

export type ServiceWithStaff = schema.Service & { staffIds: string[] };

/** Active services with the staff who offer them (deduplicated per request). */
export const listServices = cache(async (): Promise<ServiceWithStaff[]> => {
  const [rows, links] = await Promise.all([
    db.select().from(schema.services).where(eq(schema.services.active, true)).orderBy(asc(schema.services.name)),
    db
      .select({ serviceId: schema.staffServices.serviceId, staffId: schema.staffServices.staffId })
      .from(schema.staffServices)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.staffServices.staffId))
      .where(eq(schema.staff.active, true)),
  ]);
  return rows.map((s) => ({ ...s, staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId) }));
});

export const listStaff = cache(async () => db.select().from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.name)));

export async function getServiceBySlug(slug: string) {
  const s = (await listServices()).find((x) => x.slug === slug);
  if (!s) throw httpNotFound("Service");
  return s;
}

export async function getServiceById(id: string) {
  const s = (await listServices()).find((x) => x.id === id);
  if (!s) throw httpNotFound("Service");
  return s;
}

/** Staff record linked to a login, if any (staff users see their own column first). */
export async function staffForUser(userId: string) {
  const [s] = await db.select().from(schema.staff).where(eq(schema.staff.userId, userId)).limit(1);
  return s ?? null;
}
