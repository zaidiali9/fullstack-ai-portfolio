import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Read APP_URL at request time (not build time) so the sitemap link matches the deployment.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/my", "/book/confirm", "/notifications", "/api", "/app"] },
    sitemap: `${env().APP_URL}/sitemap.xml`,
  };
}
