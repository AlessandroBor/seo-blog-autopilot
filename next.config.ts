import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp and natural ship native/large deps; keep them out of the bundle.
  serverExternalPackages: ["sharp", "natural"],
};

export default nextConfig;
