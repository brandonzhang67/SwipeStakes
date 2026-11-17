import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a Node builtin; keep it out of the bundle.
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
