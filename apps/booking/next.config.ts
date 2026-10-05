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
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          isDev,
          connectSrc: ["https://api.stripe.com"],
          frameSrc: ["https://checkout.stripe.com", "https://js.stripe.com"],
          formAction: ["https://checkout.stripe.com", "https://billing.stripe.com", "https://github.com"],
          imgSrc: ["https://avatars.githubusercontent.com"],
        }),
      },
    ];
  },
};

export default nextConfig;
