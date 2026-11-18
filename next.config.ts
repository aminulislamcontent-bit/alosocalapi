import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api": ["./VERSION"],
    "/api/onboarding/system": ["./.env.example", "./prisma/schema.prisma", "./prisma/migrations/**/*"],
  },
  // Never trace private runtime configuration into the deployable standalone bundle.
  // `.env.example` is re-copied by scripts/copy-standalone-assets.mjs (template only).
  outputFileTracingExcludes: {
    "*": ["./.env", "./.env.*"],
  },
  reactStrictMode: false,
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "playwright", "@sparticuz/chromium"],
};

export default nextConfig;
