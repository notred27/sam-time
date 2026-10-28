import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local dev database) loads its own WASM files, so don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
