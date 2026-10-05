import "server-only";
import { asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { AIError } from "@portfolio/ai";
import { conflict, enforceRateLimit, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { categories } from "@db/schema";
import { getAI } from "@/lib/ai";
import { env } from "@/lib/env";
import type { StoreUser } from "./access";
import { buildDescriptionMessages, descriptionSchema, draftProblems, type DescriptionInput } from "./ai/description-core";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** "key: value" lines -> record (max 12 attributes). */
export function parseAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^:]{1,40}):\s*(.{1,160})\s*$/.exec(line);
    if (m && Object.keys(out).length < 12) out[m[1]!.trim()] = m[2]!.trim();
  }
  return out;
}

export const productInput = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  category: z.enum(categories),
  description: z.string().trim().min(20, "Write at least a sentence").max(2000),
  priceCents: z.coerce.number().int().min(50, "Minimum price is $0.50").max(10_000_00),
  stock: z.coerce.number().int().min(0).max(100_000),
  active: z.coerce.boolean(),
  featured: z.coerce.boolean(),
  attributes: z.record(z.string(), z.string()).default({}),
  /** Set by the editor when the description started from an AI draft. */
  usedAiDraft: z.coerce.boolean().default(false),
});
export type ProductInput = z.infer<typeof productInput>;

export async function listAdminProducts(q?: string) {
  return db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      name: schema.products.name,
      category: schema.products.category,
      priceCents: schema.products.priceCents,
      stock: schema.products.stock,
      active: schema.products.active,
      imagePath: schema.products.imagePath,
    })
    .from(schema.products)
    .where(q ? or(ilike(schema.products.name, `%${q}%`), ilike(schema.products.slug, `%${q}%`)) : undefined)
    .orderBy(asc(schema.products.name))
    .limit(200);
}

export async function getAdminProduct(id: string) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
  if (!p) throw notFoundError("Product");
  return p;
}

export async function saveProduct(id: string | null, input: ProductInput) {
  const slug = input.slug ?? slugify(input.name);
  const [taken] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
  if (taken && taken.id !== id) throw conflict("Another product already uses that URL slug.");
  const values = {
    name: input.name,
    slug,
    category: input.category,
    description: input.description,
    descriptionSource: input.usedAiDraft ? ("ai_edited" as const) : ("manual" as const),
    priceCents: input.priceCents,
    stock: input.stock,
    active: input.active,
    featured: input.featured,
    attributes: input.attributes,
    // Text changed -> clear the embedding; it is recomputed in the background.
    embedding: null,
  };
  if (id) {
    const [p] = await db.update(schema.products).set(values).where(eq(schema.products.id, id)).returning();
    if (!p) throw notFoundError("Product");
    return p;
  }
  const [p] = await db
    .insert(schema.products)
    .values({ ...values, imagePath: `/products/placeholder-${input.category}.webp` })
    .returning();
  return p!;
}

/** AI draft for the admin editor. Validated by zod; post-checks reported, never auto-saved. */
export async function draftDescription(user: StoreUser, input: DescriptionInput) {
  const ai = getAI();
  if (!ai.status().chat.available) throw new AIError("unavailable", "AI unavailable: no AI provider is configured on this server.", { retryable: false });
  await enforceRateLimit(db, `ai:desc:${user.id}`, { limit: env().AI_USER_PER_MINUTE, windowMs: 60_000, message: "Too many drafts in a minute. Please wait." });
  const r = await ai.generateObject({ feature: "product_description", userId: user.id, schema: descriptionSchema, messages: buildDescriptionMessages(input), maxOutputTokens: 400, temperature: 0.4 });
  return { draft: r.object, warnings: draftProblems(r.object), model: r.model };
}
