import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api": ["./VERSION"],
    "/api/onboarding/system": ["./.env.example", "./prisma/schema.prisma", "./prisma/migrations/**/*"],
  },
  reactStrictMode: false,
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "playwright", "@sparticuz/chromium"],
};

export default nextConfig;
