import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listServices } from "@/server/catalog";

export const dynamic = "force-dynamic";

/** Public pages only: the studio home and one booking page per active service. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL;
  const services = await listServices();
  return [{ url: `${base}/`, changeFrequency: "weekly", priority: 1 }, ...services.map((s) => ({ url: `${base}/book/${s.slug}`, changeFrequency: "daily" as const, priority: 0.8 }))];
}
