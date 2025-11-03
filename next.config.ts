import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  output: 'standalone',

  // Optionally, configure other production settings
  poweredByHeader: false,
  compress: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
