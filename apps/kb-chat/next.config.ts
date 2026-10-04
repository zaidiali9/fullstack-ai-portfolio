import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "@portfolio/kit/headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (BUILD_STANDALONE=1); `next start` is used otherwise.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@portfolio/ai", "@portfolio/kit", "@portfolio/ui"],
  // Native / WASM packages must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "@huggingface/transformers", "onnxruntime-node", "postgres"],
  // Monorepo root, so the standalone output includes the shared workspace packages.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  async headers() {
    const base = { isDev, imgSrc: ["https://avatars.githubusercontent.com"], formAction: ["https://github.com"] };
    return [
      // The widget page may be framed by other sites; which sites is enforced per workspace in the page.
      { source: "/embed/:path*", headers: securityHeaders({ ...base, frameAncestors: ["*"] }) },
      { source: "/((?!embed/).*)", headers: securityHeaders(base) },
      { source: "/widget.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
