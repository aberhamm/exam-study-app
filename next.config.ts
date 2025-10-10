import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  output: "standalone",

  // Optionally, configure other production settings
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
